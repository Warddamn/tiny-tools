// @author AVRG3
/** Optional paid, bounded real-agent selection/correctness checks; never part of CI. */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const repo=fileURLToPath(new URL('..',import.meta.url));
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'tiny-profile-eval-'));
await fs.writeFile(path.join(workspace,'mcp.json'),JSON.stringify({mcpServers:{'tiny-context':{command:process.execPath,args:[path.join(repo,'packages/context/dist/mcp.js')]}}}));
await fs.writeFile(path.join(workspace,'empty-mcp.json'),'{"mcpServers":{}}');
await fs.writeFile(path.join(workspace,'profile.json'),JSON.stringify({version:1,name:'Monthly reports',formats:['text'],anchors:['Monthly report'],fields:[{name:'reference',label:'Reference:',type:'text'},{name:'total',label:'Total:',type:'decimal'},{name:'date',label:'Date:',type:'date'}]}));
for(let i=0;i<25;i++)await fs.writeFile(path.join(workspace,`report-${String(i).padStart(2,'0')}.txt`),['Monthly report',`Reference: SYN-${i}`,'Date: 2026-09-30',...(i===24?[]:['Total: 1234.50']),...Array.from({length:500},(_,n)=>`Item ${n}: Synthetic unrelated product description and shipping detail.`)].join('\n'));
await fs.writeFile(path.join(workspace,'note.txt'),'The launch color is blue.\n');
const tasks=[
  {id:'recurring-batch',prompt:'Check all report-*.txt documents against the saved rules in profile.json. For each document require every anchor as an exact trimmed line and exactly one occurrence of every label at the start of a trimmed line; values on that line must match their types. Return JSON containing matched and needs_review (integer file counts) and review_file (basename of the file needing review). Use the available tools efficiently. Do not output unrelated document contents.',expected:{matched:24,needs_review:1,review_file:'report-24.txt'},tool:true},
  {id:'small-note',prompt:'What launch color is in note.txt? Return JSON containing color.',expected:{color:'blue'},tool:false},
];
const results=[];
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
for(const condition of ['tools','builtin']) {
  const selected=tasks.filter(t=>(condition==='tools'||t.id==='recurring-batch')&&(!only||t.id===only));
  for(const task of selected) {
    await fs.writeFile(path.join(workspace,'CLAUDE.md'),'Use only files in this workspace. Answer concisely. '+(condition==='tools'?'For recurring labeled documents with a saved profile, extract accepts profile and batch paths; check needs_review. Small plain text: Read directly.':''));
    const env={...process.env};delete env.CLAUDECODE;delete env.CLAUDE_CODE_ENTRYPOINT;
    const start=Date.now();
    const run=await new Promise(resolve=>{
      const child=spawn(process.env.CLAUDE_BIN??'claude',['-p',task.prompt,'--model','sonnet','--output-format','stream-json','--verbose','--max-turns','8','--max-budget-usd','0.60','--no-session-persistence','--strict-mcp-config','--mcp-config',condition==='tools'?'mcp.json':'empty-mcp.json','--allowedTools','Read','Grep','Glob','Bash','ToolSearch',...(condition==='tools'?['mcp__tiny-context__*']:[])],{cwd:workspace,env,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
      const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.on('error',e=>{clearTimeout(timer);resolve({stdout,stderr:e.message,code:1});});child.on('close',code=>{clearTimeout(timer);resolve({stdout,stderr,code});});
    });
    const messages=run.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
    const calls=messages.filter(m=>m.type==='assistant').flatMap(m=>(m.message?.content??[]).filter(c=>c.type==='tool_use').map(c=>({name:c.name,input:c.input})));
    const final=messages.findLast(m=>m.type==='result');let actual;try{actual=JSON.parse((final?.result??'').match(/\{[\s\S]*\}/)?.[0]);}catch{}
    const correct=!!actual&&Object.entries(task.expected).every(([k,v])=>actual[k]===v);
    const selectedTool=condition==='builtin'||(task.tool?calls.some(c=>c.name==='mcp__tiny-context__extract'&&c.input.profile):!calls.some(c=>c.name.startsWith('mcp__tiny-context__')));
    const bulkRead=calls.some(c=>c.name==='Read'&&/report-\d+\.txt$/.test(c.input?.file_path??'')&&!c.input.limit);
    const auth=/not logged in|oauth.*expired|Failed to authenticate/i.test(run.stdout+run.stderr);
    const result={id:task.id,condition,status:auth?'blocked_auth':run.code===0&&correct&&selectedTool&&(condition==='builtin'||!bulkRead)?'pass':'fail',correct,selectedTool,bulkRead,actual:actual??null,calls:calls.map(c=>c.name),durationMs:Date.now()-start,costUsd:final?.total_cost_usd??null,usage:final?.usage??null};
    results.push(result);console.log(JSON.stringify(result));await fs.writeFile(path.join(workspace,`${condition}-${task.id}.jsonl`),run.stdout);
    await fs.writeFile(path.join(repo,only?'evals/PROFILES-targeted.json':'evals/PROFILES.json'),JSON.stringify({workspace,results,note:'Single-run checks, Sonnet, same synthetic files and saved profile; tools condition includes routing guidance. Setup/creating the profile is excluded. Cache state is uncontrolled. Costs are reported inference estimates, not invoice charges. No general savings claim.'},null,2)+'\n');
    if(auth)throw new Error('Agent authentication blocked');
  }
}
console.log(`Transcripts: ${workspace}`);if(results.some(r=>r.status!=='pass'))process.exitCode=1;
