// @author AVRG3
import { describe, expect, it, vi } from 'vitest';
import { fingerprint } from '../src/lib/common.js';
import { RepeatGuard, runGuarded } from '../src/lib/guard.js';
const attempt = { scope: 'workflow-a', tool: 'test', args: { command: 'npm test' }, state: 'repo-hash-1' };

describe('progress-aware guard', () => {
  it('blocks the fourth unchanged failed attempt and never calls the wrapped tool', async () => {
    const guard = new RepeatGuard();
    for (let i = 0; i < 3; i++) guard.observe({ attempt, outcome: 'failure', stateAfter: attempt.state });
    const run = vi.fn(); expect((await runGuarded(guard, attempt, run, async () => attempt.state)).executed).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it('permits a test after a real edit even if its command is identical', () => {
    const guard = new RepeatGuard();
    for (let i = 0; i < 5; i++) { const changed = { ...attempt, state: `repo-${i}` }; expect(guard.check(changed).action).toBe('allow'); guard.observe({ attempt: changed, outcome: 'failure', stateAfter: changed.state }); }
  });
  it('lets batch work continue when actual inputs differ', () => {
    const guard = new RepeatGuard();
    for (let i = 0; i < 100; i++) { const a = { ...attempt, args: { id: i } }; expect(guard.check(a).action).toBe('allow'); guard.observe({ attempt: a, outcome: 'success', stateAfter: attempt.state }); }
  });
  it('detects alternating cycles without requiring adjacent repeated calls', () => {
    const guard = new RepeatGuard();
    for (let i = 0; i < 3; i++) {
      guard.observe({ attempt: { ...attempt, state: 'A' }, outcome: 'success', stateAfter: 'B' });
      guard.observe({ attempt: { ...attempt, state: 'B', args: { undo: true } }, outcome: 'success', stateAfter: 'A' });
    }
    expect(guard.check({ ...attempt, state: 'A' }).action).toBe('block');
  });
  it('only advises when trusted state is unavailable', () => {
    const guard = new RepeatGuard(); const a = { scope: 'x', tool: 'test', args: {} };
    for (let i = 0; i < 5; i++) guard.observe({ attempt: a, outcome: 'failure' });
    expect(guard.check(a).action).toBe('advise');
  });
  it('does not block successful stateless reads without evidence', () => {
    const guard = new RepeatGuard();
    for (let i = 0; i < 5; i++) guard.observe({ attempt, outcome: 'success' });
    expect(guard.check(attempt).action).toBe('allow');
  });
  it('treats host-approved polling as intentionally repeatable', () => {
    const guard = new RepeatGuard({ repeatableTools: ['test'] });
    for (let i = 0; i < 10; i++) guard.observe({ attempt, outcome: 'failure', stateAfter: attempt.state });
    expect(guard.check(attempt).action).toBe('allow');
  });
  it('isolates workflows and allows explicit reset', () => {
    const guard = new RepeatGuard();
    for (let i = 0; i < 3; i++) guard.observe({ attempt, outcome: 'failure', stateAfter: attempt.state });
    expect(guard.check({ ...attempt, scope: 'other' }).action).toBe('allow');
    guard.clear(attempt.scope); expect(guard.check(attempt).action).toBe('allow');
  });
  it('retains only bounded fingerprints and resumes from its snapshot', () => {
    const guard = new RepeatGuard({ window: 3 });
    for (let i = 0; i < 5; i++) guard.observe({ attempt, outcome: 'failure', stateAfter: attempt.state });
    const saved = guard.snapshot(); expect(saved.entries).toHaveLength(3); expect(JSON.stringify(saved)).not.toContain('npm test');
    expect(new RepeatGuard({}, saved).check(attempt).action).toBe('block');
  });
  it('normalizes object key ordering, preserving different array order', () => {
    expect(fingerprint({ b: 2, a: 1 })).toBe(fingerprint({ a: 1, b: 2 }));
    expect(fingerprint([1,2])).not.toBe(fingerprint([2,1]));
  });
  it('records exceptions but never auto-retries them', async () => {
    const guard = new RepeatGuard({ threshold: 1 }); const run = vi.fn(async () => { throw new Error('test failed'); });
    await expect(runGuarded(guard, attempt, run, async () => attempt.state)).rejects.toThrow('test failed');
    expect(run).toHaveBeenCalledTimes(1); expect(guard.check(attempt).action).toBe('block');
  });
  it('lets integrations distinguish error results from successful promises', async () => {
    const guard = new RepeatGuard({ threshold: 1 });
    await runGuarded(guard, attempt, async () => ({ isError: true }), async () => attempt.state, result => !result.isError);
    expect(guard.check(attempt).action).toBe('block');
  });
});
