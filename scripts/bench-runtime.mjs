// @author AVRG3
import assert from 'node:assert/strict';
import { collectPages, RepeatGuard, CachePlanner } from '../packages/runtime/dist/index.js';

const pages=100, perPage=100, trials=5;
const source=async cursor=>{const p=cursor===null?0:Number(cursor);return {items:Array.from({length:perPage},(_,i)=>({id:p*perPage+i,cents:(p*perPage+i)%100})),nextCursor:p+1<pages?String(p+1):null,total:pages*perPage,snapshot:'bench-v1'};};
// Honest easy-case baseline: one ordinary deterministic script, no model per page.
async function plainScript(){let cursor=null,count=0,sum=0n,calls=0;do {const page=await source(cursor);calls++;for(const row of page.items){count++;sum+=BigInt(row.cents);}cursor=page.nextCursor;}while(cursor!==null);return {count,sum:sum.toString(),calls};}
const plain=[],runtime=[];let baseline,result;
for(let i=0;i<trials;i++){
  let start=performance.now();baseline=await plainScript();plain.push(performance.now()-start);
  start=performance.now();result=await collectPages({sourceId:'bench-v1',fetchPage:source,key:'id',sumFields:['cents']});runtime.push(performance.now()-start);
  assert.equal(result.status,'complete');assert.equal(result.summary.records,baseline.count);assert.equal(result.summary.sums.cents,baseline.sum);
}
const broken=await collectPages({sourceId:'fail',fetchPage:async()=>{throw new Error('synthetic outage');}});assert.equal(broken.status,'failed');
const guard=new RepeatGuard();let blocked=0;const attempt={scope:'bench',tool:'test',args:{},state:'same'};
for(let i=0;i<100;i++){if(guard.check(attempt).action==='block')blocked++;else guard.observe({attempt,outcome:'failure',stateAfter:'same'});}
assert.equal(blocked,97);
const planner=new CachePlanner();planner.ingest({version:1,session:'s',call:'c',sequence:0,atMs:1,phase:'finishing'},1);assert.equal(planner.plan(1)[0].action,'retain');
console.log(JSON.stringify({fixture:'10,000 synthetic records / 100 pages, no I/O delays or model calls',trials,correct:true,recordCount:baseline.count,sumCents:baseline.sum,sourceRequestsPerRun:baseline.calls,plainScriptMs:plain.map(x=>+x.toFixed(2)),runtimeMs:runtime.map(x=>+x.toFixed(2)),repeatGuard:{attempts:100,executed:3,blocked},limits:'Validation/checkpoint bookkeeping costs CPU; this does not beat a correct simple script on speed. No measured token, API-cost or GPU-latency savings. onCheckpoint disk I/O is not included.'},null,2));
