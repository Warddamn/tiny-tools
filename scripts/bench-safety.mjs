// @author AVRG3
/** Synthetic disk-I/O comparison; elapsed time is reported, never a portable speed guarantee. */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectPages, CheckpointStore, ProgressBridge, CachePlanner } from '../packages/runtime/dist/index.js';
import { atomicJson } from '../packages/runtime/dist/lib/io.js';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'safety-bench-'));
const results=[];
try {
 for(const pages of [100,200])for(const mode of ['snapshot-every-page','incremental-journal']){
  const trials=[];
  for(let trial=0;trial<3;trial++){
   const dir=path.join(root,`${pages}-${mode}-${trial}`);await fs.mkdir(dir);
   const store=new CheckpointStore(dir);await store.initialize();let bytes=0,writes=0;
   const original=fs.writeFile;fs.writeFile=async function(file,data,...args){bytes+=Buffer.byteLength(data);writes++;return original.call(this,file,data,...args);};
   const start=performance.now();let result;
   try {
    result=await collectPages({sourceId:'synthetic',key:'id',sumFields:['cents'],maxPages:pages,maxRecords:pages*100,fetchPage:async cursor=>{
     const p=cursor===null?0:Number(cursor);return {items:Array.from({length:100},(_,i)=>({id:p*100+i,cents:1,note:'x'.repeat(80)})),nextCursor:p+1===pages?null:String(p+1),total:pages*100};
    },...(mode==='incremental-journal'?{onPage:store.save}:{onCheckpoint:cp=>atomicJson(path.join(dir,'checkpoint.json'),cp)})});
    await store.drain();await atomicJson(path.join(dir,'checkpoint.json'),result.checkpoint);await atomicJson(path.join(dir,'records.json'),result.records);
   }finally{fs.writeFile=original;}
   assert.equal(result.status,'complete');assert.equal(result.summary.records,pages*100);assert.equal(result.summary.sums.cents,String(pages*100));
   trials.push({bytes,writes,ms:+(performance.now()-start).toFixed(2)});
  }
  results.push({pages,records:pages*100,mode,trials});
 }
 for(const pages of [100,200]){
  const old=results.find(r=>r.pages===pages&&r.mode==='snapshot-every-page').trials[0];
  const now=results.find(r=>r.pages===pages&&r.mode==='incremental-journal').trials[0];
  assert.ok(now.bytes<old.bytes/10,'Checkpoint byte savings regressed');
 }
 const planner=new CachePlanner();planner.ingest({version:1,session:'s',call:'c',sequence:0,atMs:1000,phase:'finishing'},1000);
 let calls=0;const bridge=new ProgressBridge(planner,{apply:async()=>{calls++;}});
 for(let t=1000;t<1500;t+=10)await bridge.tick(t);assert.equal(calls,1);
 const report={fixture:'Synthetic records only. Includes page persistence, final checkpoint and records export; excludes network/model calls.',node:process.version,platform:`${process.platform}/${process.arch}`,results,duplicateHints:{ticks:50,adapterCalls:calls},limits:'Elapsed times are one machine, three runs; compare bytes, not a universal speedup. A correct plain script without checkpoints still does less work. Legacy onCheckpoint deliberately remains snapshot-based for compatibility; use CheckpointStore/onPage for incremental persistence.'};
 if(process.argv[2])await fs.writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await fs.rm(root,{recursive:true,force:true});}
