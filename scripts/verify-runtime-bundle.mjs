#!/usr/bin/env node
// @author AVRG3
/** Verify the exact portable archive, outside the checkout with no npm on the server PATH. */
import { verifyRuntimeSafety } from './verify-safety.mjs';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
assert.ok(process.argv[2],'Pass the actual MCPB archive');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-bundle-test-'));
const bundle=path.join(temp,'bundle');const client=new Client({name:'runtime-bundle-verifier',version:'1'});
try{
  execFileSync(process.platform==='win32'?'python':'python3',['-c',`import sys,zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as z:
    target=Path(sys.argv[2]).resolve()
    for name in z.namelist():
        if not (target/name).resolve().is_relative_to(target): raise ValueError('Unsafe archive path')
    z.extractall(target)
`,path.resolve(process.argv[2]),bundle]);
  const manifest=JSON.parse(await fs.readFile(path.join(bundle,'manifest.json'),'utf8'));
  assert.equal(manifest.name,'tiny-runtime');assert.equal(manifest.author.name,'AVRG3');assert.ok(manifest.compatibility.platforms.includes(process.platform));
  const pkgRoot=path.dirname(path.dirname(path.join(bundle,manifest.server.entry_point)));
  const examples=path.join(temp,'examples');await fs.cp(path.join(pkgRoot,'examples'),examples,{recursive:true});
  const args=manifest.server.mcp_config.args.map(arg=>arg.replaceAll('${__dirname}',bundle));
  await client.connect(new StdioClientTransport({command:process.execPath,args,cwd:temp,stderr:'pipe',env:{PATH:'',NODE_PATH:''}}));
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),['check_progress','collect_pages','plan_cache']);
  const cases=[['collect_pages','collect.json','config',{status:'complete',records:3,sums:{cents:'1500'}}],['check_progress','guard-trace.json','path',{next:{action:'block',repeats:3}}],['plan_cache','progress-trace.json','path',{mode:'advisory_only',retain:1,release:1}]];
  for(const[name,file,arg,expected]of cases){
    const result=await client.callTool({name,arguments:{[arg]:path.join(examples,file),output_dir:temp}});assert.ok(!result.isError,JSON.stringify(result));
    const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');assert.ok(Buffer.byteLength(text)<16000);assert.match(text,/files: \d+ · \d+ms/);
    const data=JSON.parse(text.slice(0,text.lastIndexOf('\nfiles:')));
    for(const[k,v]of Object.entries(expected)){if(k==='next'){assert.equal(data.next.action,v.action);assert.equal(data.next.repeats,v.repeats);}else assert.deepEqual(data[k],v);}
    for(const filename of data.files){assert.ok(path.isAbsolute(filename));await fs.access(filename);}
    console.log(`PASS ${name}`);
  }
  await verifyRuntimeSafety(client,temp);
  const cli=execFileSync(process.execPath,[path.join(pkgRoot,'dist/cli.js'),'--help'],{cwd:temp,encoding:'utf8'});assert.match(cli,/collect/);
  console.log(`PASS portable bundle on ${process.platform}/${process.arch}: three MCP tools + CLI, npm absent from server PATH`);
}finally{await client.close();await fs.rm(temp,{recursive:true,force:true});}
