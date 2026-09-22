// @author AVRG3
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const exec=promisify(execFile),repo=fileURLToPath(new URL('..',import.meta.url));
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-install-'));
const config=path.join(dir,'empty.npmrc');await fs.writeFile(config,'');
const env={...process.env,npm_config_userconfig:config,npm_config_audit:'false',npm_config_fund:'false'};
const npm=process.platform==='win32'?'npm.cmd':'npm';
const packed=JSON.parse((await exec(npm,['pack','--workspace','packages/runtime','--pack-destination',dir,'--json'],{cwd:repo,env})).stdout)[0];
const consumer=path.join(dir,'consumer');await fs.mkdir(consumer);await fs.writeFile(path.join(consumer,'package.json'),'{}');
await exec(npm,['install','--ignore-scripts','--omit=dev',path.join(dir,packed.filename)],{cwd:consumer,env,timeout:120000,maxBuffer:1_000_000});
const installed=path.join(consumer,'node_modules/@tiny_tools_pw/runtime');
const cli=await exec(process.execPath,[path.join(installed,'dist/cli.js'),'collect',path.join(installed,'examples/collect.json'),'--output-dir',dir],{cwd:consumer});
assert.match(cli.stdout,/"status": "complete"/);assert.match(cli.stdout,/"cents": "1500"/);
const client=new Client({name:'fresh-runtime-install',version:'1'});
try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(installed,'dist/mcp.js')],cwd:consumer,stderr:'pipe'}));
  const {tools}=await client.listTools();assert.equal(tools.length,3);
  for(const [tool,file,arg]of [['collect_pages','collect.json','config'],['check_progress','guard-trace.json','path'],['plan_cache','progress-trace.json','path']]){
    const r=await client.callTool({name:tool,arguments:{[arg]:path.join(installed,'examples',file),output_dir:dir}});assert.ok(!r.isError,JSON.stringify(r));
  }
}finally{await client.close();}
async function bytes(dir){let total=0;for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())total+=await bytes(p);else if(e.isFile())total+=(await fs.stat(p)).size;}return total;}
const result={packageBytes:packed.size,unpackedBytes:packed.unpackedSize,productionInstallBytes:await bytes(path.join(consumer,'node_modules')),cli:'pass',mcpTools:3,sourceCheckoutNeeded:false,artifact:path.join(dir,packed.filename)};
console.log(JSON.stringify(result,null,2));
if(process.argv[2])await fs.writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');
