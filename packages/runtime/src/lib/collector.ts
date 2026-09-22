// @author AVRG3
import { z } from 'zod';
import { canonical, errorMessage, fail, field, fingerprint, positiveInt } from './common.js';

const Cursor = z.string().min(1).max(8192).nullable();
export const PageSchema = z.object({
  items: z.array(z.record(z.string(), z.json())).max(100_000),
  nextCursor: Cursor, // Required: missing cursor is NOT evidence of exhaustion.
  snapshot: z.string().max(512).optional(),
  total: z.number().int().nonnegative().max(100_000).optional(),
}).strict();
export type Page = z.infer<typeof PageSchema>;
export type RecordValue = Page['items'][number];
export const StateSchema = z.object({
  version: z.literal(1), source: z.string(), options: z.string(), nextCursor: Cursor,
  exhausted: z.boolean(), pages: z.number().int().min(0).max(100_000),
  cursors: z.array(Cursor).max(100_000), records: z.array(z.record(z.string(), z.json())).max(100_000),
  duplicates: z.number().int().nonnegative(), bytes: z.number().int().nonnegative(),
  snapshot: z.string().max(512).optional(), total: z.number().int().nonnegative().optional(),
  sums: z.record(z.string(), z.string().regex(/^-?\d+$/)),
}).strict();
export type CollectionState = z.infer<typeof StateSchema>;
export const CheckpointSchema = z.object({ state: StateSchema, checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export interface CollectionOptions {
  sourceId: string;
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<unknown>;
  key?: string;
  sumFields?: string[];
  maxPages?: number; maxRecords?: number; maxBytes?: number; timeoutMs?: number;
  checkpoint?: unknown;
  signal?: AbortSignal;
  /** Called after each fully validated, committed page; persist atomically before fetching more. */
  onCheckpoint?: (checkpoint: Checkpoint) => Promise<void>;
  /** Incremental durable sink: only this page plus constant-size metadata. Must honor signal before publication. */
  onPage?: (page: { state: Omit<CollectionState, 'records' | 'cursors'>; cursor: string | null; records: RecordValue[] }, signal: AbortSignal) => Promise<void>;
  onProgress?: (progress: { pages: number; records: number; total?: number }) => void | Promise<void>;
}
export interface CollectionResult {
  status: 'complete' | 'partial' | 'failed';
  reason: string; nextStep: string;
  records: RecordValue[]; checkpoint: Checkpoint;
  summary: { pages: number; records: number; duplicates: number; sums: Record<string, string>; exhausted: boolean; total?: number };
}
export function seal(state: CollectionState): Checkpoint { return { state: structuredClone(state), checksum: fingerprint(state) }; }
function integer(value: unknown, name: string): bigint {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d{1,100}$/.test(value)) return BigInt(value);
  return fail(`Sum field '${name}' is not an exact integer.`, 'Supply integer minor units (for example cents), or aggregate decimal data with query_table.');
}
function identity(record: RecordValue, key: string): string {
  const value = field(record, key);
  if (!(typeof value === 'string' && value.length) && !(typeof value === 'number' && Number.isSafeInteger(value))) fail(`Record is missing a usable key '${key}'.`, 'Choose a nonempty string or safe integer ID field; omit key to preserve every record.');
  return canonical(value);
}
/** No hidden retry. A page is validated in full before its records/cursor are committed. */
export async function collectPages(options: CollectionOptions): Promise<CollectionResult> {
  const started = performance.now();
  const maxPages = positiveInt(options.maxPages ?? 100, 'maxPages', 10_000);
  const maxRecords = positiveInt(options.maxRecords ?? 10_000, 'maxRecords', 100_000);
  const maxBytes = positiveInt(options.maxBytes ?? 16_000_000, 'maxBytes', 64_000_000);
  const timeout = positiveInt(options.timeoutMs ?? 30_000, 'timeoutMs', 300_000);
  if (!options.sourceId) fail('sourceId is required.', 'Use a stable identity covering the dataset, filter, and account scope.');
  const sumFields = [...new Set(options.sumFields ?? [])].sort();
  if (sumFields.length > 20) fail('At most 20 sum fields are supported.');
  const config = fingerprint({ key: options.key ?? null, sumFields });
  let state: CollectionState = { version: 1, source: fingerprint(options.sourceId), options: config, nextCursor: null, exhausted: false, pages: 0, cursors: [], records: [], duplicates: 0, bytes: 0, sums: Object.fromEntries(sumFields.map(k => [k, '0'])) };
  if (options.checkpoint !== undefined) {
    const cp = CheckpointSchema.parse(options.checkpoint);
    if (fingerprint(cp.state) !== cp.checksum) fail('Checkpoint checksum does not match.', 'Use an intact checkpoint or start a new collection.');
    if (cp.state.source !== state.source || cp.state.options !== config) fail('Checkpoint belongs to a different source or aggregation.', 'Resume with the original source, key and sum fields.');
    if (cp.state.pages !== cp.state.cursors.length || new Set(cp.state.cursors).size !== cp.state.cursors.length) fail('Checkpoint has inconsistent page history.');
    state = structuredClone(cp.state);
  }
  const seen = new Map<string, string>();
  if (options.key) for (const row of state.records) {
    const id = identity(row, options.key);
    if (seen.has(id)) fail('Checkpoint contains duplicate record IDs.');
    seen.set(id, fingerprint(row));
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const expired = () => controller.signal.aborted || performance.now() - started >= timeout;
  const timer = setTimeout(abort, Math.max(1, timeout - (performance.now() - started)));
  const cursors = new Set(state.cursors);
  const finish = (reason: string, nextStep: string, complete = false): CollectionResult => ({
    status: complete ? 'complete' : state.pages ? 'partial' : 'failed', reason, nextStep,
    records: state.records, checkpoint: seal(state),
    summary: { pages: state.pages, records: state.records.length, duplicates: state.duplicates, sums: state.sums, exhausted: state.exhausted, ...(state.total !== undefined ? { total: state.total } : {}) },
  });
  try {
    if (state.records.length > maxRecords || state.bytes > maxBytes) return finish('limit', 'Raise the record/byte limit to cover the saved checkpoint.');
    if (state.exhausted) return finish('end_of_source', 'No more requests needed.', true);
    for (let request = 0; request < maxPages; request++) {
      if (expired()) return finish('cancelled_or_timeout', 'Resume from the checkpoint with more time.');
      if (cursors.has(state.nextCursor)) return finish('cursor_cycle', 'Fix the source pagination; restarting or repeating this cursor cannot prove completion.');
      let page: Page;
      try {
        // Race protects even custom adapters that neglect cancellation; adapters must cancel their own I/O.
        page = PageSchema.parse(await abortable(() => options.fetchPage(state.nextCursor, controller.signal), controller.signal));
        if (expired()) return finish('cancelled_or_timeout', 'Resume from the checkpoint with more time.');
        if (state.pages && (state.snapshot !== page.snapshot || state.total !== page.total)) fail('Source snapshot or declared total changed between pages.', 'Start a fresh collection from a stable snapshot.');
        if (page.nextCursor !== null && (page.nextCursor === state.nextCursor || cursors.has(page.nextCursor))) return finish('cursor_cycle', 'Fix the source pagination; the offending page was not committed.');
      } catch (e) {
        return finish(controller.signal.aborted ? 'cancelled_or_timeout' : 'page_error', `Page was not committed. Fix the source and resume. ${errorMessage(e).slice(0, 1000)}`);
      }
      const pageBytes = Buffer.byteLength(canonical(page));
      const added: RecordValue[] = [];
      const localSeen = new Map<string, string>();
      let duplicates = 0;
      const sums = { ...state.sums };
      try {
        for (const record of page.items) {
          if (options.key) {
            const id = identity(record, options.key), hash = fingerprint(record);
            const prior = localSeen.get(id) ?? seen.get(id);
            if (prior !== undefined) {
              if (prior !== hash) fail('The same record ID has different contents.', 'Use a stable source snapshot; conflicting records cannot be silently deduplicated.');
              duplicates++; continue;
            }
            localSeen.set(id, hash);
          }
          for (const key of sumFields) sums[key] = (BigInt(sums[key]) + integer(field(record, key), key)).toString();
          added.push(record);
        }
      } catch (e) { return finish('record_error', `Page was not committed. ${errorMessage(e).slice(0, 1000)}`); }
      if (state.records.length + added.length > maxRecords || state.bytes + pageBytes > maxBytes) return finish('limit', 'Page was not committed. Raise maxRecords/maxBytes and resume from the checkpoint.');
      const recordCount = state.records.length + added.length;
      if (page.total !== undefined && (recordCount > page.total || (page.nextCursor === null && recordCount !== page.total))) return finish('total_mismatch', 'Page was not committed. Verify total means unique records with key, or all records without key; use a stable snapshot.');
      if (expired()) return finish('cancelled_or_timeout', 'Resume the last committed checkpoint.');
      const cursor = state.nextCursor;
      const { records: _records, cursors: _cursors, ...priorMeta } = state;
      const meta = { ...priorMeta, pages: state.pages + 1, nextCursor: page.nextCursor, exhausted: page.nextCursor === null,
        duplicates: state.duplicates + duplicates, bytes: state.bytes + pageBytes, sums,
        ...(page.snapshot !== undefined ? { snapshot: page.snapshot } : {}), ...(page.total !== undefined ? { total: page.total } : {}) };
      try {
        // Incremental persistence happens before advancing in-memory state. A cancelled sink must not publish late.
        if (options.onPage) await abortable(() => options.onPage!({ state: meta, cursor, records: added }, controller.signal), controller.signal);
        if (options.onCheckpoint) {
          const candidate = { ...meta, records: [...state.records, ...added], cursors: [...state.cursors, cursor] };
          await abortable(() => options.onCheckpoint!(seal(candidate)), controller.signal);
        }
      } catch (e) { if (expired()) return finish('cancelled_or_timeout', 'Resume the last committed checkpoint.'); throw e; }
      // Append instead of repeatedly copying all collected data.
      for (const record of added) state.records.push(record); state.cursors.push(cursor); cursors.add(cursor);
      state = { ...meta, records: state.records, cursors: state.cursors };
      for (const [id, hash] of localSeen) seen.set(id, hash);
      if (expired()) return finish('cancelled_or_timeout', 'Resume the last committed checkpoint.');
      try { if (options.onProgress) await abortable(() => Promise.resolve(options.onProgress!({ pages: state.pages, records: state.records.length, total: state.total })), controller.signal); }
      catch (e) { if (expired()) return finish('cancelled_or_timeout', 'Resume the last committed checkpoint.'); throw e; }
      if (expired()) return finish('cancelled_or_timeout', 'Resume the last committed checkpoint.');
      if (state.exhausted) return finish('end_of_source', 'Complete under this source’s pagination contract; hidden server caps and omitted records cannot be detected without a trusted total/snapshot.', true);
    }
    return finish('page_limit', 'Resume from the checkpoint to continue; maxPages limits each invocation.');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
export async function abortable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('Request cancelled.');
  let abort!: () => void;
  const stopped = new Promise<never>((_, reject) => { abort = () => reject(new Error('Request cancelled.')); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([work(), stopped]); } finally { signal.removeEventListener('abort', abort); }
}
