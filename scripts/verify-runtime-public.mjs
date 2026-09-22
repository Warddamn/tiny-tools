#!/usr/bin/env node
// @author AVRG3
/** Download the documented public command into an empty cache and verify actual answers. */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const config=JSON.parse(await fs.readFile(path.join(root,'plugins/tiny-runtime/.mcp.json'),'utf8')).mcpServers['tiny-runtime'];
for(const rel of ['README.md','packages/runtime/README.md']){
  const doc=await fs.readFile(path.join(root,rel),'utf8');assert.ok(doc.includes([config.command,...config.args].join(' ')),`${rel}: command mismatch`);
  const cursor=doc.match(/install-mcp\?name=tiny-runtime&config=([^\s)]+)/)?.[1];assert.ok(cursor,`${rel}: missing Cursor badge`);
  assert.deepEqual(JSON.parse(Buffer.from(decodeURIComponent(cursor),'base64').toString()),config);
  const vs=new URL(decodeURIComponent(doc.match(/redirect\?url=([^\s)]+)/g)?.find(x=>decodeURIComponent(x).includes('tiny-runtime'))?.slice('redirect?url='.length)??''));
  assert.deepEqual(JSON.parse(decodeURIComponent(vs.search.slice(1))),{name:'tiny-runtime',...config});
}
if(process.argv.includes('--check-docs')){console.log('PASS runtime install commands and one-click button payloads agree');process.exit(0);}
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-public-test-'));const client=new Client({name:'runtime-public-verifier',version:'1'});
try{
  await fs.cp(path.join(root,'packages/runtime/examples'),path.join(temp,'examples'),{recursive:true});
  await fs.writeFile(path.join(temp,'user.npmrc'),'');await fs.writeFile(path.join(temp,'global.npmrc'),'');
  await client.connect(new StdioClientTransport({...config,cwd:temp,stderr:'pipe',env:{npm_config_cache:path.join(temp,'cache'),npm_config_userconfig:path.join(temp,'user.npmrc'),npm_config_globalconfig:path.join(temp,'global.npmrc'),npm_config_registry:'https://registry.npmjs.org/',npm_config_audit:'false',npm_config_fund:'false'}}),{timeout:240000});
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),['check_progress','collect_pages','plan_cache']);
  for(const[name,file,arg,expected]of [['collect_pages','collect.json','config',/"cents": "1500"/],['check_progress','guard-trace.json','path',/"action": "block"/],['plan_cache','progress-trace.json','path',/"retain": 1/]]){
    const result=await client.callTool({name,arguments:{[arg]:path.join(temp,'examples',file),output_dir:temp}});assert.ok(!result.isError,JSON.stringify(result));assert.match(result.content[0].text,expected);console.log(`PASS public ${name}`);
  }
  console.log('PASS public npx install: fresh cache, blank npm configs, actual answers. This verification creates automated download events.');
}finally{await client.close();await fs.rm(temp,{recursive:true,force:true});}
