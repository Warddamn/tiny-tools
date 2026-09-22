// @author AVRG3
import path from 'node:path';
import { z } from 'zod';
import { CheckpointSchema, StateSchema, seal, type Checkpoint, type CollectionOptions } from './collector.js';
import { fail, fingerprint } from './common.js';
import { absolute, atomicJson, readJson } from './io.js';
const Meta = StateSchema.omit({ records: true, cursors: true });
const Manifest = z.object({ version: z.literal(2), basePages: z.number().int().min(0).max(100_000), pages: z.number().int().min(1).max(100_000), head: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const Chunk = z.object({ state: Meta, cursor: z.string().min(1).nullable(), records: StateSchema.shape.records, previous: z.string().nullable(), checksum: z.string() }).strict();
const chunkName = (n: number) => `page-${n}.json`;
/** Both completed v1 snapshots and interrupted v2 page journals resume through the same API. */
export async function readCheckpoint(filename: string): Promise<Checkpoint> {
  const value = (await readJson(filename)).value;
  if ((value as {version?:number})?.version !== 2) return CheckpointSchema.parse(value);
  const manifest = Manifest.parse(value), dir = path.dirname(absolute(filename));
  if (manifest.basePages >= manifest.pages) fail('Checkpoint page range is invalid.');
  let cp: Checkpoint | undefined;
  if (manifest.basePages) {
    cp = CheckpointSchema.parse((await readJson(path.join(dir,'base.json'))).value);
    if (fingerprint(cp.state) !== cp.checksum || cp.state.pages !== manifest.basePages) fail('Checkpoint base checksum/history is invalid.');
  }
  let previous: string | null = cp?.checksum ?? null;
  const records = cp?.state.records ?? [], cursors = cp?.state.cursors ?? [];
  let bytes = cp?.state.bytes ?? 0, last = cp?.state;
  for(let n=manifest.basePages+1;n<=manifest.pages;n++) {
    const input = await readJson(path.join(dir,chunkName(n)), 64_000_000 - bytes + 1_000_000);
    const {checksum,...chunk} = Chunk.parse(input.value);
    if (chunk.previous !== previous || fingerprint(chunk) !== checksum || chunk.state.pages !== n) fail('Checkpoint page checksum/sequence is invalid.');
    if (last && (chunk.cursor !== last.nextCursor || chunk.state.source !== last.source || chunk.state.options !== last.options)) fail('Checkpoint page belongs to a different source/history.');
    for(const row of chunk.records) records.push(row);
    cursors.push(chunk.cursor); last = { ...chunk.state, records, cursors }; previous = checksum; bytes = chunk.state.bytes;
    if(records.length > 100_000 || bytes > 64_000_000) fail('Checkpoint exceeds collection limits.');
  }
  if(previous !== manifest.head || !last) fail('Checkpoint head checksum is invalid.');
  return seal(last);
}
/** One immutable delta per page; only the tiny commit pointer is replaced atomically. */
export class CheckpointStore {
  private basePages = 0;
  committedPages = 0;
  private previous: string | null = null;
  private pending: Promise<void> = Promise.resolve();
  constructor(private dir: string) {}
  async initialize(base?: Checkpoint) {
    if(base) { this.committedPages = base.state.pages; this.basePages = base.state.pages; this.previous = this.basePages ? base.checksum : null; if(this.basePages) await atomicJson(path.join(this.dir,'base.json'),base); }
  }
  save: NonNullable<CollectionOptions['onPage']> = (page, signal) => {
    const task = async () => {
      signal.throwIfAborted();
      const chunk = { ...page, previous: this.previous }, checksum = fingerprint(chunk);
      await atomicJson(path.join(this.dir,chunkName(page.state.pages)),{...chunk,checksum},signal);
      signal.throwIfAborted();
      await atomicJson(path.join(this.dir,'checkpoint.json'),{version:2,basePages:this.basePages,pages:page.state.pages,head:checksum},signal);
      this.previous = checksum; this.committedPages = page.state.pages;
    };
    this.pending = this.pending.then(task); return this.pending;
  };
  // Drain an in-flight filesystem write before replacing the final snapshot: no late overwrite races.
  async drain() { await this.pending.catch(()=>{}); }
}
