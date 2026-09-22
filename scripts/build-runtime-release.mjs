#!/usr/bin/env node
// @author AVRG3
/** Build one portable MCPB and a small npm-style tarball from the checked-in lockfile. */
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=path.resolve(process.argv[2]??path.join(root,'.tmp/runtime-release'));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-release-'));
const mirror=path.join(temp,'install'),stage=path.join(temp,'bundle');
const pkg=JSON.parse(await fs.readFile(path.join(root,'packages/runtime/package.json'),'utf8'));
const npmPath=process.env.npm_execpath;assert.ok(npmPath,'Run npm run bundle:runtime');
await fs.mkdir(out,{recursive:true});
await fs.mkdir(mirror);await fs.mkdir(stage);
const env={...process.env,npm_config_userconfig:path.join(temp,'user.npmrc'),npm_config_globalconfig:path.join(temp,'global.npmrc'),npm_config_registry:'https://registry.npmjs.org/'};
const npm=args=>execFileSync(process.execPath,[npmPath,...args],{cwd:mirror,env,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
try {
  await fs.writeFile(env.npm_config_userconfig,'');await fs.writeFile(env.npm_config_globalconfig,'');
  const manifests=['package.json','package-lock.json','bench/package.json','evals/package.json'];
  for(const entry of await fs.readdir(path.join(root,'packages'),{withFileTypes:true}))if(entry.isDirectory())manifests.push(`packages/${entry.name}/package.json`);
  for(const relative of manifests){await fs.mkdir(path.dirname(path.join(mirror,relative)),{recursive:true});await fs.copyFile(path.join(root,relative),path.join(mirror,relative));}
  for(const relative of pkg.files)await fs.cp(path.join(root,'packages/runtime',relative),path.join(mirror,'packages/runtime',relative),{recursive:true});
  npm(['ci','--omit=dev','--ignore-scripts','--workspace=packages/runtime','--include-workspace-root=false','--no-audit','--no-fund']);
  await fs.cp(path.join(mirror,'node_modules'),path.join(stage,'node_modules'),{recursive:true,dereference:true,filter:src=>!['.bin','.package-lock.json'].includes(path.basename(src))});
  async function assertPortable(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())await assertPortable(full);else assert.ok(!entry.name.endsWith('.node'),`Native dependency needs platform-specific packaging: ${full}`);}}
  await assertPortable(stage);
  const {TOOLS,DESCRIPTIONS}=await import(pathToFileURL(path.join(root,'packages/runtime/dist/tools.js')));
  const entry=`node_modules/${pkg.name}/dist/mcp.js`;
  const manifest={manifest_version:'0.3',name:'tiny-runtime',display_name:'tiny-runtime — pagination, retry loops and tool progress',version:pkg.version,
    description:'Collect paginated records, inspect repeated failures and plan cache hints from tool progress.',
    long_description:'Three deterministic MCP tools by AVRG3 for agent workflows. collect_pages finishes cursor-paginated API or local batches, checks duplicates and totals, writes checkpoints, and reports complete/partial/failed. check_progress diagnoses repeated failures against measured state. plan_cache generates advisory cache hints from progress traces. SDK wrappers provide automatic guards and live progress delivery; GPU effects require a compatible serving-engine adapter. No model calls or telemetry. HTTP sources are explicit, read-only GET requests. Includes dependencies; requires Node.js 20+.',
    author:{name:'AVRG3',url:'https://github.com/Warddamn'},repository:{type:'git',url:'https://github.com/Warddamn/tiny-tools'},
    homepage:'https://github.com/Warddamn/tiny-tools/tree/main/packages/runtime#readme',documentation:'https://github.com/Warddamn/tiny-tools/blob/main/packages/runtime/QUICKSTART.md',support:'https://github.com/Warddamn/tiny-tools/issues',
    license:'MIT',keywords:pkg.keywords,compatibility:{platforms:['darwin','linux','win32'],runtimes:{node:'>=20'}},
    server:{type:'node',entry_point:entry,mcp_config:{command:'node',args:[`\${__dirname}/${entry}`]}},
    tools:TOOLS.map(t=>({name:t.name,description:DESCRIPTIONS[t.name]}))};
  await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.copyFile(path.join(root,'LICENSE'),path.join(stage,'LICENSE'));
  await fs.copyFile(path.join(root,'packages/runtime/QUICKSTART.md'),path.join(stage,'README.md'));
  const bundleName=`tiny-runtime-${pkg.version}.mcpb`,tarName=`tiny-runtime-${pkg.version}.tgz`;
  console.log(npm(['exec','--yes','--package=@anthropic-ai/mcpb@2.1.2','--','mcpb','pack',stage,path.join(out,bundleName)]).split('\n').slice(-6).join('\n'));
  const packed=JSON.parse(npm(['pack','--workspace=packages/runtime','--ignore-scripts','--json','--pack-destination',out]))[0];
  await fs.rename(path.join(out,packed.filename),path.join(out,tarName));
  const hash=async name=>createHash('sha256').update(await fs.readFile(path.join(out,name))).digest('hex');
  const base=JSON.parse(await fs.readFile(path.join(root,'packages/runtime/server.json'),'utf8'));
  assert.ok(base.description.length<=100);assert.equal(base.version,pkg.version);
  const server={...base,packages:[{registryType:'mcpb',identifier:`https://github.com/Warddamn/tiny-tools/releases/download/runtime-v${pkg.version}/${bundleName}`,fileSha256:await hash(bundleName),transport:{type:'stdio'}}]};
  await fs.writeFile(path.join(out,'server.json'),JSON.stringify(server,null,2)+'\n');
  const names=[bundleName,tarName,'server.json'];const sums=[];
  for(const name of names)sums.push(`${await hash(name)}  ${name}`);
  await fs.writeFile(path.join(out,'SHA256SUMS.txt'),sums.join('\n')+'\n');
  console.log(JSON.stringify({version:pkg.version,bundle:path.join(out,bundleName),bundleBytes:(await fs.stat(path.join(out,bundleName))).size,tarball:path.join(out,tarName),tarballBytes:(await fs.stat(path.join(out,tarName))).size}));
}finally{await fs.rm(temp,{recursive:true,force:true});}
