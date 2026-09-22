// @author AVRG3
import path from 'node:path';
import { z } from 'zod';
import { CollectConfig, CollectInput, FileInput, GuardConfig, PlanConfig } from '../schemas.js';
import { httpPageSource } from './adapters.js';
import { collectPages, PageSchema, seal } from './collector.js';
import { canonical, fail, fingerprint } from './common.js';
import { RepeatGuard } from './guard.js';
import { absolute, atomicJson, jobDirectory, readJson } from './io.js';
import { CachePlanner } from './progress.js';

export interface JobResult { ok: boolean; summary: Record<string, unknown>; files: string[] }
export async function collectJob(raw: unknown): Promise<JobResult> {
  const args = CollectInput.parse(raw), configPath = absolute(args.config);
  const config = CollectConfig.parse((await readJson(configPath)).value);
  let sourceId: string;
  let fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<unknown>;
  if (config.source.type === 'http') {
    const { maxPageBytes: _limit, ...identity } = config.source;
    sourceId = canonical(identity); fetchPage = httpPageSource(config.source);
  } else {
    const filename = path.resolve(path.dirname(configPath), config.source.path);
    const manifest = z.object({ pages: z.array(z.object({ cursor: z.string().min(1).nullable(), page: PageSchema }).strict()).max(10_000) }).strict().parse((await readJson(filename, config.maxBytes)).value);
    const cursors = new Map(manifest.pages.map(p => [p.cursor, p.page]));
    if (cursors.size !== manifest.pages.length) fail('Source manifest has duplicate request cursors.', 'Use one page per cursor, with null for the first page.');
    sourceId = canonical({ path: filename, content: fingerprint(manifest) });
    fetchPage = async cursor => { const page = cursors.get(cursor); if (!page) fail('Manifest lacks the requested cursor.', 'Provide the missing page before starting a new collection.'); return page; };
  }
  const checkpoint = args.checkpoint ? (await readJson(args.checkpoint)).value : undefined;
  const dir = await jobDirectory(configPath, args.output_dir), checkpointPath = path.join(dir, 'checkpoint.json');
  const result = await collectPages({ ...config, sourceId, fetchPage, checkpoint, onCheckpoint: cp => atomicJson(checkpointPath, cp) });
  await atomicJson(checkpointPath, seal(result.checkpoint.state));
  const recordsPath = path.join(dir, 'records.json'); await atomicJson(recordsPath, result.records);
  const report = { status: result.status, reason: result.reason, nextStep: result.nextStep, ...result.summary };
  const reportPath = path.join(dir, 'report.json'); await atomicJson(reportPath, report);
  return { ok: result.status === 'complete', summary: report, files: [recordsPath, checkpointPath, reportPath] };
}
export async function guardJob(raw: unknown): Promise<JobResult> {
  const args = FileInput.parse(raw), input = await readJson(args.path), config = GuardConfig.parse(input.value);
  const guard = new RepeatGuard(config.options), decisions = [];
  for (const observation of config.observations) { decisions.push(guard.check(observation.attempt)); guard.observe(observation); }
  const next = config.nextAttempt ? guard.check(config.nextAttempt) : undefined;
  const report = { mode: 'analysis_only', calls: decisions.length, blocked: decisions.filter(d => d.action === 'block').length, advised: decisions.filter(d => d.action === 'advise').length, ...(next ? { next } : {}) };
  const dir = await jobDirectory(args.path, args.output_dir), reportPath = path.join(dir, 'report.json');
  await atomicJson(reportPath, { ...report, decisions, snapshot: guard.snapshot() });
  return { ok: true, summary: report, files: [reportPath] };
}
export async function cacheJob(raw: unknown): Promise<JobResult> {
  const args = FileInput.parse(raw), config = PlanConfig.parse((await readJson(args.path)).value);
  const planner = new CachePlanner(config.options); let accepted = 0;
  for (const event of config.events) if (planner.ingest(event, config.nowMs)) accepted++;
  const hints = planner.plan(config.nowMs, config.retainedSessions);
  const counts = Object.fromEntries(['retain','prefetch','release'].map(k => [k, hints.filter(h => h.action === k).length]));
  const report = { mode: 'advisory_only', accepted, rejected: config.events.length - accepted, ...counts, nextStep: 'Use ProgressBridge with a compatible cache adapter to apply live hints. No GPU/cache changes were made.' };
  const dir = await jobDirectory(args.path, args.output_dir), reportPath = path.join(dir, 'report.json');
  await atomicJson(reportPath, { ...report, hints });
  return { ok: true, summary: report, files: [reportPath] };
}
