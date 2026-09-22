// @author AVRG3
import { describe, expect, it, vi } from 'vitest';
import { CachePlanner, ProgressReporter, ProgressBridge } from '../src/lib/progress.js';
import type { ProgressEvent } from '../src/lib/progress.js';
const event = (patch: Partial<ProgressEvent> = {}): ProgressEvent => ({ version: 1, session: 's1', call: 'c1', sequence: 0, atMs: 1000, phase: 'running', ...patch });

describe('tool progress and cache scheduling', () => {
  it('uses two measurements to prefer work that is actually near completion', () => {
    const planner = new CachePlanner();
    planner.ingest(event({ completed: 0, total: 100 }), 1000);
    planner.ingest(event({ sequence: 1, atMs: 2000, completed: 90, total: 100 }), 2000);
    expect(planner.plan(2000)[0]).toMatchObject({ action: 'retain', estimatedRemainingMs: 112 });
  });
  it('does not guess from a single counter, stalled counter, changed total or overdue estimate', () => {
    for (const patch of [{ completed: 0, total: 100 }, { completed: 90, total: 101 }, { completed: 100, total: 100 }]) {
      const p = new CachePlanner(); p.ingest(event({ completed: 0, total: 100 }), 1000); p.ingest(event({ sequence: 1, atMs: 2000, ...patch }), 2000);
      expect(p.plan(2000)[0].estimatedRemainingMs).toBeNull();
    }
    const p = new CachePlanner(); p.ingest(event({ completed: 0, total: 100 }), 1000);
    expect(p.plan(1000)[0].action).toBe('release');
    p.ingest(event({ sequence: 1, atMs: 2000, completed: 90, total: 100 }), 2000);
    expect(p.plan(2200)[0].estimatedRemainingMs).toBeNull();
  });
  it('waits for all parallel calls and does not equate one done call with ready', () => {
    const p = new CachePlanner(); p.ingest(event({ phase: 'done' }), 1000); p.ingest(event({ call: 'c2' }), 1000);
    expect(p.plan(1000)[0].action).toBe('release');
    p.ingest(event({ call: 'c2', phase: 'done', sequence: 1, atMs: 1100 }), 1100);
    expect(p.plan(1100)[0].action).toBe('prefetch');
  });
  it('expires stale hints and caps leases and capacity', () => {
    const p = new CachePlanner({ staleMs: 1000, leaseMs: 500 });
    p.ingest(event({ phase: 'finishing' }), 1000); p.ingest(event({ session: 's2', phase: 'finishing' }), 1000);
    expect(p.plan(1000, 1).filter(h => h.action === 'retain')).toHaveLength(1);
    expect(p.plan(1900, 1)[0].validUntilMs).toBe(2000);
    expect(p.plan(2001, 1).every(h => h.action === 'release')).toBe(true);
  });
  it('rejects stale, future, duplicate and out-of-order events without reviving finished calls', () => {
    const p = new CachePlanner();
    expect(p.ingest(event(), 10_000)).toBe(false); expect(p.ingest(event(), 0)).toBe(false);
    expect(p.ingest(event({ phase: 'done' }), 1000)).toBe(true);
    expect(p.ingest(event(), 1000)).toBe(false); expect(p.ingest(event({ sequence: 1, atMs: 1001 }), 1001)).toBe(false);
  });
  it('never retains sessions when capacity is zero and rejects invalid counts', () => {
    const p = new CachePlanner(); p.ingest(event({ phase: 'done' }), 1000);
    expect(p.plan(1000,0)[0].action).toBe('release'); expect(() => p.plan(1000,-1)).toThrow();
    expect(() => p.ingest(event({ completed: 3, total: 2 }), 1000)).toThrow();
  });
  it('bounds tracked calls/sessions and reclaims expired capacity', () => {
    const p = new CachePlanner({ maxSessions: 1, maxCalls: 1 }); p.ingest(event(),1000);
    expect(() => p.ingest(event({ session: 's2' }),1000)).toThrow(/capacity/);
    expect(p.prune(7000)).toBe(1); expect(p.ingest(event({ session: 's2', atMs: 7000 }),7000)).toBe(true);
  });
  it('emits monotonically ordered, content-free progress and prevents reports after completion', () => {
    const sink = vi.fn(); const reporter = new ProgressReporter('s','c',sink,() => 1);
    reporter.report('running',0,100); reporter.report('running',50,100); reporter.report('done',100,100);
    expect(sink.mock.calls.map(c => c[0].sequence)).toEqual([0,1,2]); expect(() => reporter.report('running')).toThrow(/terminal/);
    expect(Object.keys(sink.mock.calls[0][0]).sort()).toEqual(['atMs','call','completed','phase','sequence','session','total','version']);
  });
  it('bridge applies explicit adapter hints and exposes adapter failures', async () => {
    const p = new CachePlanner(); p.ingest(event({ phase: 'done' }), 1000);
    const apply = vi.fn(async () => {}); const bridge = new ProgressBridge(p, { apply });
    const good = await bridge.tick(1000); expect(good.applied).toEqual(['s1']); expect(apply.mock.calls[0][0].action).toBe('prefetch');
    apply.mockRejectedValueOnce(new Error('unavailable'));
    const bad = await bridge.tick(1100); expect(bad.applied).toEqual([]); expect(bad.failed).toHaveLength(1);
    await bridge.tick(7000); expect(apply.mock.calls.at(-1)![0].action).toBe('release');
  });
});
