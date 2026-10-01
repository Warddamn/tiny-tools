// @author AVRG3
/** Synthetic comparison includes a correct prepared script; no model/API use or claimed bill savings. */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { runTool } from '../packages/context/dist/tools.js';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tiny-record-bench-'));
const trials=5, rows=[];
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
try {
  for(const size of [1,10000]) {
    for(const scenario of ['unchanged-reordered','three-changes']) {
      const before=Array.from({length:size},(_,id)=>({id:`order-${id}`,status:'open',quantity:1,description:'Synthetic order metadata; no company data.',checkedAt:'2026-09-29'}));
      const after=structuredClone(before).reverse().map(row=>({...row,checkedAt:'2026-09-30'}));
      if(scenario==='three-changes')for(let i=0;i<Math.min(3,size);i++)after[i].status='closed';
      const a=path.join(dir,'before.json'),b=path.join(dir,'after.json');
      await fs.writeFile(a,JSON.stringify(before));await fs.writeFile(b,JSON.stringify(after));
      const rawBytes=(await fs.stat(a)).size+(await fs.stat(b)).size;
      const expected={before:size,after:size,added:0,removed:0,changed:scenario==='three-changes'?Math.min(3,size):0,unchanged:scenario==='three-changes'?size-Math.min(3,size):size};
      const times=[],baselineTimes=[];let text,baseline;
      for(let trial=0;trial<trials;trial++) {
        // Deliberately simple, independent, correct script for these known valid fixtures.
        let start=performance.now();const aa=JSON.parse(await fs.readFile(a,'utf8')),bb=JSON.parse(await fs.readFile(b,'utf8'));
        const map=new Map(bb.map(r=>[r.id,r]));let changed=0;
        const changes=aa.filter(r=>{const other=map.get(r.id);if(r.status!==other.status||r.quantity!==other.quantity){changed++;return true;}return false;}).map(r=>({id:r.id,before:r.status,after:map.get(r.id).status}));
        baseline=JSON.stringify({counts:{...expected,changed,unchanged:size-changed},changes});baselineTimes.push(performance.now()-start);
        assert.equal(changed,expected.changed);
        start=performance.now();text=await runTool('diff_files',{a,b,mode:'records',key:['/id'],fields:['/status','/quantity']});times.push(performance.now()-start);
        const counts=JSON.parse(text.split('\n')[0].slice('Record comparison (exact within scope): '.length));assert.deepEqual(counts,expected);
      }
      rows.push({scenario,size,rawBytes,responseBytes:Buffer.byteLength(text),preparedScriptBytes:Buffer.byteLength(baseline),toolMedianMs:median(times),preparedScriptMedianMs:median(baselineTimes)});
    }
  }
  const lines=['# Keyed JSON comparison benchmark','',`Synthetic fixtures; ${trials} warm-process trials per case; medians; ${process.platform}/${process.arch}, Node ${process.version}. Includes file reads, parsing, validation, comparison and response formatting. Excludes MCP startup/model turns. Record order and checkedAt differ; only status/quantity are in scope. All counts asserted against fixture truth. No company data.`, '', '| Records per snapshot | Scenario | Both inputs (bytes) | Tool response (bytes) | Prepared script response (bytes) | Tool median ms | Prepared script median ms |','|---:|---|---:|---:|---:|---:|---:|'];
  for(const r of rows)lines.push(`| ${r.size} | ${r.scenario} | ${r.rawBytes} | ${r.responseBytes} | ${r.preparedScriptBytes} | ${r.toolMedianMs.toFixed(2)} | ${r.preparedScriptMedianMs.toFixed(2)} |`);
  lines.push('', 'The prepared script already knows the schema and fixture invariants. It is a real efficient alternative, and its output is smaller and its processing can be faster. This feature supplies validation, duplicate/precision checks, scope reporting, bounded previews and optional full reports without asking an agent to write that script. It is not a new faster-than-map-lookup algorithm.', '', 'Comparing tool output with both entire files measures context payload avoided, not total model tokens, billed dollars, CPU savings, or independent usage. For tiny files or an existing correct script, use the built-in path. For large, frequently changing snapshots, prefer source-side change feeds where available. JSONL/NDJSON uses the same comparison, with per-line parsing; no JSONL timing claim from this benchmark.', '', 'Reproduce: `npm run bench:records`. Results vary by hardware. The benchmark checks answers, not a minimum marketing percentage.', '');
  const output=process.argv[2]??'bench/RECORDS.md';await fs.writeFile(output,lines.join('\n'));console.log(JSON.stringify(rows,null,2));
}finally{await fs.rm(dir,{recursive:true,force:true});}
