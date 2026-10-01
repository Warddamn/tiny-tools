// @author AVRG3
/** Regression checks run against installed MCP artifacts, not source imports. */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
export async function verifyContextSafety(client,dir){
  const input=path.join(dir,'safe-input.csv'),keep=path.join(dir,'keep.csv');
  await fs.writeFile(input,'value\n10\n20\n');await fs.writeFile(keep,'UNCHANGED');
  const quote=s=>s.replaceAll("'","''");
  for(const sql of [`COPY (SELECT 'WRONG') TO '${quote(keep)}'`,`SELECT * FROM read_text('${quote(keep)}')`,`SELECT 1; SELECT 2`]){
    const r=await client.callTool({name:'query_table',arguments:{path:input,sql}});assert.equal(r.isError,true,'Unsafe SQL was accepted');
  }
  assert.equal(await fs.readFile(keep,'utf8'),'UNCHANGED');
  const collision=await client.callTool({name:'query_table',arguments:{path:input,sql:'SELECT * FROM t',out:input.slice(0,-4)}});assert.equal(collision.isError,true);
  assert.equal(await fs.readFile(input,'utf8'),'value\n10\n20\n');
  const exported=path.join(dir,'answer.csv');const good=await client.callTool({name:'query_table',arguments:{path:input,sql:'SELECT SUM(value) AS total FROM t',out:exported}});
  assert.ok(!good.isError);assert.equal(await fs.readFile(exported,'utf8'),'total\n30\n');
  console.log('PASS installed SQL restrictions, protected input/output, and explicit CSV export');
  const before=path.join(dir,'orders-before.json'),after=path.join(dir,'orders-after.json'),report=path.join(dir,'changes.jsonl');
  await fs.writeFile(before,JSON.stringify([{id:'A',status:'open'},{id:'B',status:'open'}]));
  await fs.writeFile(after,JSON.stringify([{id:'B',status:'closed'},{id:'A',status:'open'}]));
  const compared=await client.callTool({name:'diff_files',arguments:{a:before,b:after,mode:'records',key:['/id'],fields:['/status'],out:report}});
  assert.ok(!compared.isError,'Installed records comparison failed');assert.match(compared.content[0].text,/"changed":1/);assert.match(compared.content[0].text,/"unchanged":1/);
  const changes=(await fs.readFile(report,'utf8')).trim().split('\n').map(s=>JSON.parse(s));assert.equal(changes.length,2);assert.deepEqual(changes[1].key,['B']);assert.equal(changes[1].fields[0].after.value,'closed');
  await fs.writeFile(after,'[{"id":9007199254740993}]');
  const lossy=await client.callTool({name:'diff_files',arguments:{a:before,b:after,mode:'records',key:['/id']}});assert.equal(lossy.isError,true,'Lossy record ID accepted');
  console.log('PASS installed keyed JSON changes, exact report, and precision rejection');
}
export async function verifyRuntimeSafety(client,dir){
  const attempt={scope:'installed',tool:'read',args:{path:'config'},state:'unchanged'};
  const trace=path.join(dir,'successful-reads.json');await fs.writeFile(trace,JSON.stringify({observations:Array.from({length:8},()=>({attempt,outcome:'success',stateAfter:attempt.state})),nextAttempt:attempt}));
  const r=await client.callTool({name:'check_progress',arguments:{path:trace,output_dir:dir}});assert.ok(!r.isError);assert.match(r.content[0].text,/"action": "allow"/);
  console.log('PASS installed guard permits repeated successful unchanged reads');
}
