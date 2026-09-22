// @author AVRG3
/** Optional paid agent selection eval, capped at $0.50/task; never runs in npm test/CI. */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { collectJob } from '../packages/runtime/dist/lib/jobs.js';
const repo=fileURLToPath(new URL('..',import.meta.url));
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'tiny-runtime-eval-'));
await fs.writeFile(path.join(workspace,'CLAUDE.md'),'Use only this workspace and the configured tiny-runtime server. Answer concisely.\n'+await fs.readFile(path.join(repo,'packages/runtime/docs/AGENT_USAGE.md'),'utf8'));
await fs.writeFile(path.join(workspace,'mcp.json'),JSON.stringify({mcpServers:{'tiny-runtime':{command:process.execPath,args:[path.join(repo,'packages/runtime/dist/mcp.js')]}}}));
const pages=Array.from({length:10},(_,p)=>({cursor:p===0?null:String(p),page:{items:Array.from({length:100},(_,i)=>({id:p*100+i,cents:10})),nextCursor:p===9?null:String(p+1),total:1000,snapshot:'v1'}}));
await fs.writeFile(path.join(workspace,'pages.json'),JSON.stringify({pages}));
await fs.writeFile(path.join(workspace,'collect.json'),JSON.stringify({source:{type:'file',path:'pages.json'},key:'id',sumFields:['cents']}));
const limited=path.join(workspace,'resume.json');await fs.writeFile(limited,JSON.stringify({source:{type:'file',path:'pages.json'},key:'id',sumFields:['cents'],maxPages:6}));
const partial=await collectJob({config:limited});const checkpoint=partial.files.find(p=>p.endsWith('checkpoint.json'));
await fs.copyFile(path.join(repo,'packages/runtime/examples/guard-trace.json'),path.join(workspace,'guard.json'));
await fs.copyFile(path.join(repo,'packages/runtime/examples/progress-trace.json'),path.join(workspace,'progress.json'));
await fs.writeFile(path.join(workspace,'note.txt'),'The launch color is blue.\n');
const tasks=[
  {id:'collect',prompt:`Finish the collection configured in ${workspace}/collect.json. Return JSON with status, records, and sumCents.`,tool:'collect_pages',expected:{status:'complete',records:1000,sumCents:'10000'}},
  {id:'resume',prompt:`Continue the interrupted collection configured in ${limited}, using checkpoint ${checkpoint}. Return JSON with status, records, and sumCents.`,tool:'collect_pages',expected:{status:'complete',records:1000,sumCents:'10000'}},
  {id:'guard',prompt:`Inspect ${workspace}/guard.json. Should the next attempt run at the recorded unchanged state? Return JSON with action and repeats.`,tool:'check_progress',expected:{action:'block',repeats:3}},
  {id:'cache',prompt:`Analyze ${workspace}/progress.json for the serving-engine integration. Return JSON with retain and release counts and gpuChanged (boolean).`,tool:'plan_cache',expected:{retain:1,release:1,gpuChanged:false}},
  {id:'small-note',prompt:`What launch color is in ${workspace}/note.txt? Return JSON with color.`,tool:null,expected:{color:'blue'}},
];
const results=[];
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
const selectedTasks=tasks.filter(t=>!only||t.id===only);
for(const task of selectedTasks){
  const env={...process.env};delete env.CLAUDECODE;delete env.CLAUDE_CODE_ENTRYPOINT;
  const start=Date.now();
  const run=await new Promise(resolve=>{
    const child=spawn('claude',['-p',task.prompt,'--model','sonnet','--output-format','stream-json','--verbose','--max-turns','8','--max-budget-usd','0.50','--no-session-persistence','--strict-mcp-config','--mcp-config','mcp.json','--allowedTools','Read','Grep','Glob','Bash','ToolSearch','mcp__tiny-runtime__*'],{cwd:workspace,env,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
    const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.on('error',e=>{clearTimeout(timer);resolve({stdout,stderr:e.message,code:1});});child.on('close',code=>{clearTimeout(timer);resolve({stdout,stderr,code});});
  });
  const messages=run.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const calls=messages.filter(m=>m.type==='assistant').flatMap(m=>(m.message?.content??[]).filter(c=>c.type==='tool_use').map(c=>({name:c.name,input:c.input})));
  const final=messages.findLast(m=>m.type==='result');
  const answer=final?.result??'';const json=answer.match(/\{[\s\S]*\}/)?.[0];let actual;try{actual=JSON.parse(json);}catch{}
  const correct=actual&&Object.entries(task.expected).every(([k,v])=>String(actual[k])===String(v));
  const readBulk=calls.some(c=>c.name==='Read'&&/pages\.json$|checkpoint\.json$/.test(c.input?.file_path??''));
  const selected=!readBulk&&(task.tool?calls.some(c=>c.name===`mcp__tiny-runtime__${task.tool}`):!calls.some(c=>c.name.startsWith('mcp__tiny-runtime__')));
  const auth=/authentication|not logged in|oauth.*expired|Failed to authenticate/i.test(run.stdout+run.stderr);
  const result={id:task.id,status:auth?'blocked_auth':run.code===0&&correct&&selected?'pass':'fail',correct:!!correct,selected,actual:actual??null,calls:calls.map(c=>c.name),durationMs:Date.now()-start,costUsd:final?.total_cost_usd??null};
  results.push(result);console.log(JSON.stringify(result));
  await fs.writeFile(path.join(workspace,`${task.id}.jsonl`),run.stdout);
  if(auth)break;
}
const output=process.argv[2];if(output)await fs.writeFile(output,JSON.stringify({workspace,results,note:'Five single-run selection/correctness checks, not an efficiency comparison or adoption evidence.'},null,2)+'\n');
console.log(`Transcripts: ${workspace}`);if(results.length!==selectedTasks.length||results.some(r=>r.status!=='pass'))process.exitCode=1;
