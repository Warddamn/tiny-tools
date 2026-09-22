// @author AVRG3
import { z } from 'zod';
import { fail, nonnegative, positiveInt } from './common.js';

export const ProgressEventSchema = z.object({
  version: z.literal(1), session: z.string().min(1).max(256), call: z.string().min(1).max(256),
  sequence: z.number().int().nonnegative(), atMs: z.number().finite().nonnegative(),
  phase: z.enum(['running', 'finishing', 'done', 'failed', 'cancelled']),
  completed: z.number().finite().nonnegative().optional(), total: z.number().finite().positive().optional(),
}).strict().refine(e => e.total === undefined || (e.completed !== undefined && e.completed <= e.total), 'total requires completed <= total');
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;
export interface CacheHint {
  session: string; action: 'retain' | 'prefetch' | 'release';
  reason: string; estimatedRemainingMs: number | null; validUntilMs: number;
}
export interface ProgressOptions { staleMs?: number; nearMs?: number; leaseMs?: number; maxSessions?: number; maxCalls?: number }
interface CallState { latest: ProgressEvent; previous?: ProgressEvent; startedAt: number; rate?: number }
const terminal = (phase: ProgressEvent['phase']) => ['done', 'failed', 'cancelled'].includes(phase);
/** Instrument known units. Reports contain no prompt, output, path, or document content. */
export class ProgressReporter {
  private sequence = 0;
  private closed = false;
  constructor(private session: string, private call: string, private sink: (event: ProgressEvent) => void, private now = Date.now) {}
  report(phase: ProgressEvent['phase'], completed?: number, total?: number): void {
    if (this.closed) fail('Progress call is already terminal.', 'Create a reporter with a new unique call ID.');
    const event = ProgressEventSchema.parse({ version: 1, session: this.session, call: this.call, sequence: this.sequence, atMs: this.now(), phase, ...(completed !== undefined ? { completed } : {}), ...(total !== undefined ? { total } : {}) });
    this.sink(event); this.sequence++;
    if (terminal(phase)) this.closed = true;
  }
}
/** Advisory scheduler; only a serving-engine adapter can actually change GPU cache residency. */
export class CachePlanner {
  private calls = new Map<string, CallState>();
  private staleMs: number; private nearMs: number; private leaseMs: number;
  private maxSessions: number; private maxCalls: number;
  constructor(options: ProgressOptions = {}) {
    this.staleMs = positiveInt(options.staleMs ?? 5000, 'staleMs', 300_000);
    this.nearMs = positiveInt(options.nearMs ?? 1000, 'nearMs', 60_000);
    this.leaseMs = positiveInt(options.leaseMs ?? 2000, 'leaseMs', 60_000);
    this.maxSessions = positiveInt(options.maxSessions ?? 1000, 'maxSessions', 100_000);
    this.maxCalls = positiveInt(options.maxCalls ?? 5000, 'maxCalls', 100_000);
  }
  ingest(raw: unknown, now = Date.now()): boolean {
    const event = ProgressEventSchema.parse(raw); nonnegative(now, 'now');
    if (event.atMs > now || now - event.atMs > this.staleMs) return false; // Same clock domain required.
    const key = JSON.stringify([event.session, event.call]), prior = this.calls.get(key);
    if (prior && (event.sequence <= prior.latest.sequence || event.atMs < prior.latest.atMs || terminal(prior.latest.phase))) return false;
    if (!prior) {
      if (this.calls.size >= this.maxCalls) fail('Progress call capacity reached.', 'Expire old sessions with prune(now), or increase maxCalls.');
      if (new Set([...this.calls.values()].map(c => c.latest.session)).size >= this.maxSessions && ![...this.calls.values()].some(c => c.latest.session === event.session)) fail('Progress session capacity reached.', 'Expire old sessions with prune(now), or increase maxSessions.');
    }
    let rate: number | undefined;
    if (prior && event.completed !== undefined && prior.latest.completed !== undefined && event.total !== undefined && event.total === prior.latest.total && event.completed > prior.latest.completed && event.atMs > prior.latest.atMs) {
      const measured = (event.completed - prior.latest.completed) / (event.atMs - prior.latest.atMs);
      if (Number.isFinite(measured) && measured > 0) rate = measured;
    }
    // No progress, changing totals, or counter regression invalidates any old rate estimate.
    this.calls.set(key, { latest: event, previous: prior?.latest, startedAt: prior?.startedAt ?? event.atMs, rate });
    return true;
  }
  plan(now = Date.now(), retainedSessions = 1): CacheHint[] {
    nonnegative(now, 'now');
    if (!Number.isSafeInteger(retainedSessions) || retainedSessions < 0) fail('retainedSessions must be a nonnegative integer.');
    const sessions = new Map<string, CallState[]>();
    for (const state of this.calls.values()) {
      const group = sessions.get(state.latest.session) ?? []; group.push(state); sessions.set(state.latest.session, group);
    }
    const candidates: { session: string; eta: number | null; finished: boolean; updated: number; reason: string }[] = [];
    for (const [session, calls] of sessions) {
      const latestAt = Math.max(...calls.map(c => c.latest.atMs));
      if (latestAt > now || now - latestAt > this.staleMs) { candidates.push({ session, eta: null, finished: false, updated: latestAt, reason: 'stale_progress' }); continue; }
      const active = calls.filter(c => !terminal(c.latest.phase));
      // In a fork/join session the model resumes after ALL parallel calls return, not the first.
      let eta: number | null = 0;
      for (const c of active) {
        const age = now - c.latest.atMs;
        if (age < 0 || age > this.staleMs) { eta = null; break; }
        if (c.latest.phase === 'finishing') continue;
        if (c.rate === undefined || c.latest.completed === undefined || c.latest.total === undefined || c.latest.completed >= c.latest.total) { eta = null; break; }
        // If the predicted finish passed without an update, do not keep trusting the prediction.
        const estimate = (c.latest.total - c.latest.completed) / c.rate - age;
        if (!Number.isFinite(estimate) || estimate <= 0) { eta = null; break; }
        eta = Math.max(eta!, estimate);
      }
      candidates.push({ session, eta, finished: active.length === 0, updated: latestAt, reason: eta === null ? 'unknown_remaining_time' : active.length ? 'measured_progress' : 'tool_calls_returned' });
    }
    const ready = candidates.filter(c => c.eta !== null && c.eta <= this.nearMs).sort((a,b) => a.eta! - b.eta! || b.updated - a.updated || a.session.localeCompare(b.session));
    const selected = new Set(ready.slice(0, retainedSessions).map(c => c.session));
    return candidates.sort((a,b) => a.session.localeCompare(b.session)).map(c => ({
      session: c.session, action: selected.has(c.session) ? (c.finished ? 'prefetch' : 'retain') : 'release',
      reason: !selected.has(c.session) && ready.includes(c) ? 'capacity_limit' : c.reason,
      estimatedRemainingMs: c.eta === null ? null : Math.ceil(c.eta),
      validUntilMs: Math.max(now, Math.min(now + this.leaseMs, c.updated + this.staleMs)),
    }));
  }
  prune(now = Date.now()): number {
    nonnegative(now, 'now'); let removed = 0;
    const newest = new Map<string, number>();
    for (const c of this.calls.values()) newest.set(c.latest.session, Math.max(newest.get(c.latest.session) ?? 0, c.latest.atMs));
    for (const [key,c] of this.calls) {
      // An old unfinished sibling must remain unknown while other calls in that session are active.
      if (now - (newest.get(c.latest.session) ?? now) > this.staleMs || (terminal(c.latest.phase) && now - c.latest.atMs > this.staleMs)) { this.calls.delete(key); removed++; }
    }
    return removed;
  }
}
export interface CacheAdapter { apply(hint: CacheHint): Promise<void> }
/** Deliver to an explicit engine adapter; failures are visible and never masquerade as applied hints. */
export async function deliverHints(hints: CacheHint[], adapter: CacheAdapter): Promise<{ applied: string[]; failed: { session: string; reason: string }[] }> {
  const applied: string[] = [], failed: { session: string; reason: string }[] = [];
  for (const hint of hints) {
    try { await adapter.apply(hint); applied.push(hint.session); }
    catch { failed.push({ session: hint.session, reason: 'Engine adapter rejected the hint; verify endpoint, authentication and lease support.' }); }
  }
  return { applied, failed };
}
/** Small live bridge: host forwards progress here and calls tick while tools run. */
export class ProgressBridge {
  constructor(readonly planner: CachePlanner, readonly adapter: CacheAdapter) {}
  async tick(now = Date.now(), retainedSessions = 1) {
    const hints = this.planner.plan(now, retainedSessions);
    const delivery = await deliverHints(hints, this.adapter);
    this.planner.prune(now); // Send release before forgetting expired state.
    return { hints, ...delivery };
  }
}
