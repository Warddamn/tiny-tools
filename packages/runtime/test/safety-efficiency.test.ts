// @author AVRG3
import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectPages } from '../src/lib/collector.js';
import { CheckpointStore, readCheckpoint } from '../src/lib/checkpoint-store.js';
import { collectJob } from '../src/lib/jobs.js';
import { RepeatGuard, runGuarded } from '../src/lib/guard.js';
import { CachePlanner, ProgressBridge, deliverHints, type CacheHint } from '../src/lib/progress.js';
const dirs:string[]=[];
async function temporary(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-safety-'));dirs.push(dir);return dir;}
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(dir=>fs.rm(dir,{recursive:true,force:true})));});
const source=async(c:string|null)=>{const n=c===null?0:Number(c);return {items:[{id:n,cents:1}],nextCursor:n===99?null:String(n+1),total:100};};
describe('runtime safety and cost regressions',()=>{
 it('successful unchanged reads remain allowed, failures still stop, and changed state can recover',async()=>{
  const guard=new RepeatGuard(),attempt={scope:'test',tool:'read',args:{path:'config'},state:'hash'};
  for(let i=0;i<10;i++)expect((await runGuarded(guard,attempt,async()=>true,async()=>attempt.state)).executed).toBe(true);
  for(let i=0;i<3;i++)guard.observe({attempt,outcome:'failure',stateAfter:attempt.state});expect(guard.check(attempt).action).toBe('block');expect(guard.check({...attempt,state:'new'}).action).toBe('allow');
 });
 it('a successful recovery resets earlier failures',()=>{
  const guard=new RepeatGuard(),attempt={scope:'recover',tool:'read',args:{},state:'same'};
  for(let i=0;i<2;i++)guard.observe({attempt,outcome:'failure',stateAfter:'same'});
  guard.observe({attempt,outcome:'success',stateAfter:'same'});guard.observe({attempt,outcome:'failure',stateAfter:'same'});
  expect(guard.check(attempt)).toMatchObject({action:'allow',repeats:1});
 });
 it('preserves a disk commit that wins the cancellation acknowledgement race',async()=>{
  const dir=await temporary(),controller=new AbortController();
  await fs.writeFile(path.join(dir,'pages.json'),JSON.stringify({pages:[{cursor:null,page:{items:[{id:1,cents:10}],nextCursor:'next'}},{cursor:'next',page:{items:[{id:2,cents:20}],nextCursor:null}}]}));
  const config=path.join(dir,'config.json');await fs.writeFile(config,JSON.stringify({source:{type:'file',path:'pages.json'},sumFields:['cents']}));
  const initialize=CheckpointStore.prototype.initialize;
  vi.spyOn(CheckpointStore.prototype,'initialize').mockImplementation(async function(this:CheckpointStore,base){
   await initialize.call(this,base);const save=this.save;
   this.save=async(page,signal)=>{await save(page,signal);controller.abort();await new Promise<void>(()=>{});};
  });
  const result=await collectJob({config},{signal:controller.signal});expect(result.ok).toBe(false);expect(result.summary).toMatchObject({pages:1,records:1,sums:{cents:'10'}});
  const checkpoint=await readCheckpoint(result.files.find(f=>f.endsWith('checkpoint.json'))!);expect(checkpoint.state.nextCursor).toBe('next');expect(checkpoint.state.records).toHaveLength(1);
 });
 it('persists linear page data and resumes an interrupted journal with identical answers',async()=>{
  const dir=await temporary(),store=new CheckpointStore(dir);await store.initialize();
  await expect(collectPages({sourceId:'fixture',key:'id',sumFields:['cents'],fetchPage:source,onPage:store.save,onProgress:({pages})=>{if(pages===60)throw new Error('simulated process interruption');}})).rejects.toThrow(/interruption/);
  const saved=await readCheckpoint(path.join(dir,'checkpoint.json'));expect(saved.state.records).toHaveLength(60);
  const resumed=await collectPages({sourceId:'fixture',key:'id',sumFields:['cents'],fetchPage:source,checkpoint:saved});expect(resumed.status).toBe('complete');expect(resumed.summary).toMatchObject({records:100,sums:{cents:'100'}});
  const chunks=(await fs.readdir(dir)).filter(f=>f.startsWith('page-'));expect(chunks).toHaveLength(60);let stored=0;for(const f of chunks)stored+=JSON.parse(await fs.readFile(path.join(dir,f),'utf8')).records.length;
  expect(stored).toBe(60);expect((await fs.stat(path.join(dir,'checkpoint.json'))).size).toBeLessThan(256);
 });
 it('resumes old snapshots into independent journals and rejects tampered pages',async()=>{
  const original=await collectPages({sourceId:'fixture',fetchPage:source,maxPages:1});const dir=await temporary(),store=new CheckpointStore(dir);await store.initialize(original.checkpoint);
  await expect(collectPages({sourceId:'fixture',fetchPage:source,checkpoint:original.checkpoint,onPage:store.save,onProgress:()=>{throw new Error('crash');}})).rejects.toThrow();expect((await readCheckpoint(path.join(dir,'checkpoint.json'))).state.records).toHaveLength(2);expect(original.checkpoint.state.records).toHaveLength(1);
  const file=path.join(dir,'page-2.json'),value=JSON.parse(await fs.readFile(file,'utf8'));value.records[0].id=99;await fs.writeFile(file,JSON.stringify(value));await expect(readCheckpoint(path.join(dir,'checkpoint.json'))).rejects.toThrow(/checksum/);
 });
 for(const hook of ['onCheckpoint','onPage','onProgress'] as const)it(`bounds a ${hook} callback that never resolves`,async()=>{
  const start=performance.now();const result=await collectPages({sourceId:'test',fetchPage:async()=>({items:[{id:1}],nextCursor:null}),timeoutMs:20,[hook]:()=>new Promise<void>(()=>{})});expect(result.reason).toBe('cancelled_or_timeout');expect(result.status).not.toBe('complete');expect(performance.now()-start).toBeLessThan(1000);
 });
 it('coalesces identical ticks and renews a live lease before expiry',async()=>{
  const p=new CachePlanner();p.ingest({version:1,session:'s',call:'c',sequence:0,atMs:1000,phase:'finishing'},1000);const apply=vi.fn(async(_hint:CacheHint)=>{}),bridge=new ProgressBridge(p,{apply});
  for(let i=0;i<5;i++)await bridge.tick(1000+i*10);expect(apply).toHaveBeenCalledTimes(1);await bridge.tick(2001);expect(apply).toHaveBeenCalledTimes(2);await bridge.tick(2100,0);expect(apply).toHaveBeenCalledTimes(3);expect(apply.mock.calls[2][0].action).toBe('release');
 });
 it('coalesces simultaneous ticks instead of overlapping requests',async()=>{
  const p=new CachePlanner();p.ingest({version:1,session:'s',call:'c',sequence:0,atMs:1000,phase:'finishing'},1000);let finish!:()=>void;const apply=vi.fn(()=>new Promise<void>(r=>{finish=r;})),bridge=new ProgressBridge(p,{apply});const a=bridge.tick(1000),b=bridge.tick(1001);finish();await Promise.all([a,b]);expect(apply).toHaveBeenCalledTimes(1);
 });
 it('does not send expired hints or report late acknowledgements as applied',async()=>{
  let now=0;const hint:CacheHint={session:'s',action:'retain',reason:'test',estimatedRemainingMs:1,validUntilMs:10};const apply=vi.fn(async()=>{now=11;});
  const result=await deliverHints([hint,{...hint,session:'next'}],{apply},{now:()=>now,concurrency:1});expect(result.applied).toEqual([]);expect(result.failed).toHaveLength(2);expect(apply).toHaveBeenCalledTimes(1);
 });
 it('times out an uncooperative adapter and continues bounded delivery',async()=>{
  const hint:CacheHint={session:'s',action:'retain',reason:'test',estimatedRemainingMs:1,validUntilMs:Date.now()+1000};const result=await deliverHints([hint],{apply:()=>new Promise(()=>{})},{timeoutMs:10});expect(result.applied).toEqual([]);expect(result.failed).toHaveLength(1);
 });
});
