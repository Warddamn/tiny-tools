// @author AVRG3
import { z } from 'zod';
import { fail, fingerprint, positiveInt } from './common.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const AttemptSchema = z.object({
  scope: z.string().min(1).max(512), tool: z.string().min(1).max(256), args: z.json(),
  // State must come from a trusted adapter (file/repository hash, etag, dataset version).
  state: z.string().min(1).max(1024).optional(),
}).strict();
export type Attempt = z.infer<typeof AttemptSchema>;
export const ObservationSchema = z.object({
  attempt: AttemptSchema, outcome: z.enum(['success', 'failure']),
  stateAfter: z.string().min(1).max(1024).optional(),
}).strict();
export type Observation = z.infer<typeof ObservationSchema>;
const EntrySchema = z.object({ signature: hash, scope: hash, state: hash.optional(), after: hash.optional(), outcome: z.enum(['success', 'failure']) }).strict();
export type GuardEntry = z.infer<typeof EntrySchema>;
export const GuardSnapshotSchema = z.object({ version: z.literal(1), entries: z.array(EntrySchema).max(1000) }).strict();
export interface GuardDecision {
  action: 'allow' | 'advise' | 'block'; reason: string; repeats: number; nextStep: string;
}
export interface GuardOptions { threshold?: number; window?: number; repeatableTools?: string[] }
/** Bounded, per-workflow history containing fingerprints only. No model/API calls. */
export class RepeatGuard {
  private entries: GuardEntry[];
  private threshold: number;
  private window: number;
  private repeatable: Set<string>;
  constructor(options: GuardOptions = {}, snapshot?: unknown) {
    this.threshold = positiveInt(options.threshold ?? 3, 'threshold', 100);
    this.window = positiveInt(options.window ?? 100, 'window', 1000);
    if (this.window < this.threshold) fail('window must be at least threshold.');
    this.repeatable = new Set(options.repeatableTools ?? []);
    this.entries = snapshot === undefined ? [] : GuardSnapshotSchema.parse(snapshot).entries.slice(-this.window);
  }
  check(input: Attempt): GuardDecision {
    const attempt = AttemptSchema.parse(input);
    const allowed = (reason: string): GuardDecision => ({ action: 'allow', reason, repeats: 0, nextStep: 'Proceed.' });
    if (this.repeatable.has(attempt.tool)) return allowed('Host explicitly permits repetition for this tool (for example polling).');
    const signature = fingerprint({ tool: attempt.tool, args: attempt.args }), scope = fingerprint(attempt.scope);
    const state = attempt.state === undefined ? undefined : fingerprint(attempt.state);
    const related = this.entries.filter(e => e.scope === scope && e.signature === signature);
    const same = related.filter(e => e.state === state);
    // A->B->A cycles repeat the same transition; distinct outcomes after the same state are not proof of a loop.
    const stalls = same.filter(e => (e.outcome === 'failure' && (e.after === undefined || e.after === state)) || (state !== undefined && e.after === state));
    const cycles = state === undefined ? [] : same.filter(e => e.after !== undefined && e.after !== state);
    const grouped = new Map<string, number>();
    for (const e of cycles) grouped.set(e.after!, (grouped.get(e.after!) ?? 0) + 1);
    const repeats = Math.max(stalls.length, ...grouped.values(), 0);
    if (repeats >= this.threshold) {
      const trusted = state !== undefined;
      return { action: trusted ? 'block' : 'advise', repeats,
        reason: trusted ? 'Same action at the same observed state repeatedly failed, made no change, or repeated a state transition.' : 'Repeated failures, but no trusted state fingerprint is available.',
        nextStep: trusted ? 'Change the approach or fix the underlying condition; refresh the measured state before retrying. Explicit polling belongs in a host repeatableTools policy.' : 'Inspect the failure and supply a trusted state fingerprint; this guard does not block without one.' };
    }
    return { ...allowed(state === undefined ? 'Insufficient repeated failure evidence; state is unobserved.' : 'No repeated stall or cycle at this state.'), repeats };
  }
  observe(input: Observation): void {
    const { attempt, outcome, stateAfter } = ObservationSchema.parse(input);
    const e: GuardEntry = { signature: fingerprint({ tool: attempt.tool, args: attempt.args }), scope: fingerprint(attempt.scope), outcome };
    if (attempt.state !== undefined) e.state = fingerprint(attempt.state);
    if (stateAfter !== undefined) e.after = fingerprint(stateAfter);
    this.entries.push(e);
    if (this.entries.length > this.window) this.entries.shift();
  }
  snapshot(): z.infer<typeof GuardSnapshotSchema> { return { version: 1, entries: structuredClone(this.entries) }; }
  clear(scope: string): void { const key = fingerprint(scope); this.entries = this.entries.filter(e => e.scope !== key); }
}
export type GuardedResult<T> = { executed: false; decision: GuardDecision } | { executed: true; decision: GuardDecision; value: T };
/** Serial use per workflow. No retries and no exception swallowing; observe a real state after the call. */
export async function runGuarded<T>(guard: RepeatGuard, attempt: Attempt, run: () => Promise<T>, observeState: () => Promise<string | undefined>, succeeded: (value: T) => boolean = () => true): Promise<GuardedResult<T>> {
  const decision = guard.check(attempt);
  if (decision.action === 'block') return { executed: false, decision };
  let value: T;
  try { value = await run(); }
  catch (error) {
    guard.observe({ attempt, outcome: 'failure', stateAfter: await observeState().catch(() => undefined) });
    throw error;
  }
  guard.observe({ attempt, outcome: succeeded(value) ? 'success' : 'failure', stateAfter: await observeState().catch(() => undefined) });
  return { executed: true, decision, value };
}
