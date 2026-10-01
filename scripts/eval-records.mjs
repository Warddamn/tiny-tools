// @author AVRG3
/** Optional paid, bounded real-agent selection/correctness checks; never part of CI. */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const repo=fileURLToPath(new URL('..',import.meta.url));
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'tiny-record-eval-'));
await fs.writeFile(path.join(workspace,'mcp.json'),JSON.stringify({mcpServers:{'tiny-context':{command:process.execPath,args:[path.join(repo,'packages/context/dist/mcp.js')]}}}));
await fs.writeFile(path.join(workspace,'empty-mcp.json'),'{"mcpServers":{}}');
const before=Array.from({length:5000},(_,id)=>({id:`order-${id}`,status:'open',quantity:1,checkedAt:'yesterday',description:'Synthetic public test data only.'}));
const after=structuredClone(before).reverse().map(r=>({...r,checkedAt:'today'}));after[0].status='closed';after[1].status='closed';after[2].status='closed';
for(const [name,data] of [['before.json',before],['after.json',after],['same.json',[...before].reverse()],['duplicates.json',[{id:1,status:'open'},{id:1,status:'closed'}]]])await fs.writeFile(path.join(workspace,name),JSON.stringify(data));
await fs.writeFile(path.join(workspace,'note.txt'),'The launch color is blue.\n');
const tasks=[
  {id:'orders',prompt:'Compare before.json and after.json. Records are identified by id. Compare only status and quantity; ignore row order and all other fields. Return JSON containing added, removed, changed, unchanged (record counts) and closed (number newly closed).',expected:{added:0,removed:0,changed:3,unchanged:4997,closed:3},tool:true},
  {id:'reordered',prompt:'Compare before.json and same.json for actual record changes by id, ignoring record order. Return JSON containing changed, unchanged, added, removed as integer record counts, not lists.',expected:{changed:0,unchanged:5000,added:0,removed:0},tool:true},
  {id:'ambiguous',prompt:'Can duplicates.json be reliably compared with itself using id as a unique record key? Check using the available file tool if applicable. Return JSON containing reliable (boolean) and duplicateKey (boolean).',expected:{reliable:false,duplicateKey:true},tool:true},
  {id:'small-note',prompt:'What launch color is in note.txt? Return JSON containing color.',expected:{color:'blue'},tool:false},
];
const results=[];
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
for(const condition of ['tools','builtin']) {
  const selected=tasks.filter(t=>(condition==='tools'||['orders','reordered'].includes(t.id))&&(!only||t.id===only));
  for(const task of selected) {
    await fs.writeFile(path.join(workspace,'CLAUDE.md'),'Use only files in this workspace. Answer concisely. '+(condition==='tools'?'For JSON/JSONL snapshots use diff_files records mode with explicit identity pointers and field scope. Small plain text: Read directly.':''));
    const env={...process.env};delete env.CLAUDECODE;delete env.CLAUDE_CODE_ENTRYPOINT;
    const start=Date.now();
    const run=await new Promise(resolve=>{
      const child=spawn('claude',['-p',task.prompt,'--model','sonnet','--output-format','stream-json','--verbose','--max-turns','8','--max-budget-usd','0.60','--no-session-persistence','--strict-mcp-config','--mcp-config',condition==='tools'?'mcp.json':'empty-mcp.json','--allowedTools','Read','Grep','Glob','Bash','ToolSearch',...(condition==='tools'?['mcp__tiny-context__*']:[])],{cwd:workspace,env,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
      const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.on('error',e=>{clearTimeout(timer);resolve({stdout,stderr:e.message,code:1});});child.on('close',code=>{clearTimeout(timer);resolve({stdout,stderr,code});});
    });
    const messages=run.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
    const calls=messages.filter(m=>m.type==='assistant').flatMap(m=>(m.message?.content??[]).filter(c=>c.type==='tool_use').map(c=>({name:c.name,input:c.input})));
    const final=messages.findLast(m=>m.type==='result');let actual;try{actual=JSON.parse((final?.result??'').match(/\{[\s\S]*\}/)?.[0]);}catch{}
    const correct=!!actual&&Object.entries(task.expected).every(([k,v])=>actual[k]===v);
    const selectedTool=condition==='builtin'||(task.tool?calls.some(c=>c.name==='mcp__tiny-context__diff_files'&&c.input.mode==='records'):!calls.some(c=>c.name.startsWith('mcp__tiny-context__')));
    const bulkRead=calls.some(c=>c.name==='Read'&&/(before|after|same)\.json$/.test(c.input?.file_path??'')&&!c.input.limit);
    const auth=/not logged in|oauth.*expired|Failed to authenticate/i.test(run.stdout+run.stderr);
    const result={id:task.id,condition,status:auth?'blocked_auth':run.code===0&&correct&&selectedTool&&(condition==='builtin'||!bulkRead)?'pass':'fail',correct,selectedTool,bulkRead,actual:actual??null,calls:calls.map(c=>c.name),durationMs:Date.now()-start,costUsd:final?.total_cost_usd??null,usage:final?.usage??null};
    results.push(result);console.log(JSON.stringify(result));await fs.writeFile(path.join(workspace,`${condition}-${task.id}.jsonl`),run.stdout);
    await fs.writeFile(path.join(repo,only?'evals/RECORDS-targeted.json':'evals/RECORDS.json'),JSON.stringify({workspace,results,note:'Single-run checks, Sonnet, same fixtures and built-ins; tools condition includes routing guidance. Not a general savings or adoption claim.'},null,2)+'\n');
    if(auth)throw new Error('Agent authentication blocked');
  }
}
console.log(`Transcripts: ${workspace}`);if(results.some(r=>r.status!=='pass'))process.exitCode=1;
