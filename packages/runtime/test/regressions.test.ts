// @author AVRG3
import { expect,it } from 'vitest';
import { RepeatGuard } from '../src/lib/guard.js';
import { CachePlanner } from '../src/lib/progress.js';
it('does not classify different observed transitions as a repeated stall despite failed outcomes',()=>{
  const guard=new RepeatGuard();const attempt={scope:'x',tool:'test',args:{},state:'A'};
  for(let i=0;i<3;i++)guard.observe({attempt,outcome:'failure',stateAfter:`B${i}`});
  expect(guard.check(attempt).action).toBe('allow');
});
it('keeps a stale unfinished sibling unknown when fresh parallel work finishes',()=>{
  const planner=new CachePlanner({staleMs:100});
  planner.ingest({version:1,session:'s',call:'a',sequence:0,atMs:0,phase:'running'},0);
  planner.ingest({version:1,session:'s',call:'b',sequence:0,atMs:200,phase:'done'},200);
  planner.prune(200);expect(planner.plan(200)[0].action).toBe('release');expect(planner.plan(200)[0].estimatedRemainingMs).toBeNull();
});
