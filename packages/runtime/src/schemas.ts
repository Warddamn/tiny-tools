// @author AVRG3
import { z } from 'zod';
import { HttpSourceSchema } from './lib/adapters.js';
import { AttemptSchema, ObservationSchema } from './lib/guard.js';
import { ProgressEventSchema } from './lib/progress.js';

export const CollectConfig = z.object({
  source: z.discriminatedUnion('type', [z.object({ type: z.literal('file'), path: z.string().min(1) }).strict(), HttpSourceSchema]),
  key: z.string().min(1).optional(), sumFields: z.array(z.string().min(1)).max(20).default([]),
  maxPages: z.number().int().min(1).max(10_000).default(100), maxRecords: z.number().int().min(1).max(100_000).default(10_000),
  maxBytes: z.number().int().min(1).max(64_000_000).default(16_000_000), timeoutMs: z.number().int().min(1).max(300_000).default(30_000),
}).strict();
export const GuardConfig = z.object({
  observations: z.array(ObservationSchema).max(100_000), nextAttempt: AttemptSchema.optional(),
  options: z.object({ threshold: z.number().int().min(1).max(100).optional(), window: z.number().int().min(1).max(1000).optional(), repeatableTools: z.array(z.string()).max(100).optional() }).strict().optional(),
}).strict();
export const PlanConfig = z.object({
  events: z.array(ProgressEventSchema).max(100_000), nowMs: z.number().finite().nonnegative(), retainedSessions: z.number().int().min(0).max(1000).default(1),
  options: z.object({ staleMs: z.number().int().min(1).max(300_000).optional(), nearMs: z.number().int().min(1).max(60_000).optional(), leaseMs: z.number().int().min(1).max(60_000).optional(), maxSessions: z.number().int().min(1).max(100_000).optional(), maxCalls: z.number().int().min(1).max(100_000).optional() }).strict().optional(),
}).strict();
export const CollectInput = z.object({
  config: z.string().min(1).describe('Required JSON job path. Example: /data/collect.json. No default.'),
  checkpoint: z.string().min(1).optional().describe('Saved checkpoint path to resume; pass unchanged, do not Read its records into context. Default: start fresh. Example: /data/tiny-runtime-abc/checkpoint.json.'),
  output_dir: z.string().min(1).optional().describe('Parent for a NEW job directory; never overwrites inputs. Default: beside config. Example: /tmp/results.'),
}).strict();
export const FileInput = z.object({
  path: z.string().min(1).describe('Required JSON trace path. Example: /data/trace.json. No default.'),
  output_dir: z.string().min(1).optional().describe('Parent for a NEW report directory. Default: beside input. Example: /tmp/results.'),
}).strict();
export const DESCRIPTIONS = {
  collect_pages: 'Collect and aggregate an entire cursor-paginated source with checked resumption. USE WHEN: many pages must be fetched without model turns between pages. Pass checkpoint/source paths directly; do not Read their records into context. PREFER OVER: manual next-page calls; a single request or an existing correct script is fine for simple work. DOES NOT: infer API mappings, bypass permissions, retry writes, or prove completeness beyond the source contract; HTTP is explicit and read-only. EXAMPLE: collect_pages({config:"/data/collect.json"}). RETURNS: complete/partial/failed, counts, exact integer sums, and local records/checkpoint paths plus timing.',
  check_progress: 'Inspect a tool trace for repeated stalls and cycles at the same measured state. USE WHEN: an agent repeats failed or unchanged work. PREFER OVER: re-reading a long transcript; a short obvious failure is fine to inspect directly. DOES NOT: observe hidden state, block without trusted fingerprints, or intercept another client; use the SDK wrapper for enforcement. EXAMPLE: check_progress({path:"/data/guard-trace.json"}). RETURNS: decision, repeat counts, advice, and a local report plus timing.',
  plan_cache: 'Turn measured tool progress into bounded cache scheduling hints. USE WHEN: integrating a serving engine with tool-progress events or replaying a trace. PREFER OVER: guessing fixed tool durations; no tool is needed for ordinary hosted-model usage. DOES NOT: change GPU cache, control hosted models, or establish savings; live application requires the SDK bridge and a compatible serving adapter. EXAMPLE: plan_cache({path:"/data/progress-trace.json"}). RETURNS: advisory retain/prefetch/release counts and a local report with expiring hints plus timing.',
};
