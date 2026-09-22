// @author AVRG3
import assert from 'node:assert/strict';
import { collectPages, RepeatGuard, runGuarded, ProgressReporter, CachePlanner, ProgressBridge } from '../dist/index.js';

// Synthetic data only. A host can connect the same sink to HTTP with httpCacheAdapter.
const planner = new CachePlanner();
let now = 1000;
const reporter = new ProgressReporter('demo-session', 'collect-1', e => planner.ingest(e, now), () => now);
const appliedHints = [];
const bridge = new ProgressBridge(planner, { apply: async hint => { appliedHints.push(hint); } });
reporter.report('running', 0, 200);
let sourceCalls = 0;
const result = await collectPages({
  sourceId: 'synthetic-200-records-v1', key: 'id', sumFields: ['cents'],
  fetchPage: async cursor => {
    sourceCalls++;
    const first = cursor === null ? 0 : Number(cursor);
    return { items: Array.from({length:50}, (_,i) => ({ id:first+i, cents:10 })), nextCursor: first+50<200 ? String(first+50) : null, total:200, snapshot:'v1' };
  },
  onProgress: ({records,total}) => { now += 100; reporter.report('running', records, total); },
});
reporter.report('done', 200, 200);
await bridge.tick(now);
assert.equal(result.status, 'complete'); assert.equal(result.summary.sums.cents, '2000');
assert.equal(appliedHints.at(-1).action, 'prefetch');

const guard = new RepeatGuard();
let executions = 0, blocked = 0;
for (let i=0;i<10;i++) {
  const result = await runGuarded(guard, { scope:'demo-workflow',tool:'check',args:{target:'synthetic'},state:'unchanged-v1' }, async () => { executions++; return {ok:false}; }, async () => 'unchanged-v1', value=>value.ok);
  if (!result.executed) blocked++;
}
assert.equal(executions,3); assert.equal(blocked,7);
const afterEdit = guard.check({scope:'demo-workflow',tool:'check',args:{target:'synthetic'},state:'edited-v2'});
assert.equal(afterEdit.action,'allow');
console.log(JSON.stringify({ collection:{...result.summary,sourceCalls,modelCalls:0},guard:{executions,blocked,afterEdit:afterEdit.action},cache:{adapter:'in-memory reference (no GPU)',hints:appliedHints},note:'Synthetic behavior demonstration, not a token/cost or production GPU benchmark.' },null,2));
