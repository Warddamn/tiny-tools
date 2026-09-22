#!/usr/bin/env node
// @author AVRG3
/** Build the public tarball with our unpublished shared workspace bundled inside it. */
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=path.resolve(process.argv[2]??path.join(root,'.tmp/context-release'));
const stage=await fs.mkdtemp(path.join(os.tmpdir(),'context-release-'));
const pkg=JSON.parse(await fs.readFile(path.join(root,'packages/context/package.json'),'utf8'));
const shared=JSON.parse(await fs.readFile(path.join(root,'packages/shared/package.json'),'utf8'));
assert.ok(process.env.npm_execpath,'Run npm run bundle:context');
try {
  await fs.mkdir(out,{recursive:true});
  for(const rel of [...pkg.files,'README.md']) await fs.cp(path.join(root,'packages/context',rel),path.join(stage,rel),{recursive:true});
  await fs.copyFile(path.join(root,'LICENSE'),path.join(stage,'LICENSE'));
  const internal=path.join(stage,'node_modules',shared.name);
  await fs.mkdir(internal,{recursive:true});
  for(const rel of shared.files) await fs.cp(path.join(root,'packages/shared',rel),path.join(internal,rel),{recursive:true});
  await fs.writeFile(path.join(internal,'package.json'),JSON.stringify(shared,null,2)+'\n');
  await fs.copyFile(path.join(root,'LICENSE'),path.join(internal,'LICENSE'));
  const manifest={...pkg,files:[...pkg.files,'README.md','LICENSE'],dependencies:{...pkg.dependencies,...shared.dependencies},bundleDependencies:[shared.name]};
  delete manifest.scripts;
  await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n');
  const packed=JSON.parse(execFileSync(process.execPath,[process.env.npm_execpath,'pack','--ignore-scripts','--json','--pack-destination',out],{cwd:stage,encoding:'utf8'}))[0];
  assert.ok(packed.bundled.includes(shared.name),'Internal shared code was not bundled');
  const filename=`tiny-context-standalone-${pkg.version}.tgz`;
  await fs.rename(path.join(out,packed.filename),path.join(out,filename));
  console.log(`Built ${path.join(out,filename)} (${packed.size} bytes), shared code included; third-party dependencies install normally.`);
} finally { await fs.rm(stage,{recursive:true,force:true}); }
