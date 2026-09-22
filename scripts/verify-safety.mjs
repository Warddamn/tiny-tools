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
}
export async function verifyRuntimeSafety(client,dir){
  const attempt={scope:'installed',tool:'read',args:{path:'config'},state:'unchanged'};
  const trace=path.join(dir,'successful-reads.json');await fs.writeFile(trace,JSON.stringify({observations:Array.from({length:8},()=>({attempt,outcome:'success',stateAfter:attempt.state})),nextAttempt:attempt}));
  const r=await client.callTool({name:'check_progress',arguments:{path:trace,output_dir:dir}});assert.ok(!r.isError);assert.match(r.content[0].text,/"action": "allow"/);
  console.log('PASS installed guard permits repeated successful unchanged reads');
}
