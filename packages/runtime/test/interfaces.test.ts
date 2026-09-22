// @author AVRG3
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ProgressNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { collectJob } from '../src/lib/jobs.js';
import { readJson } from '../src/lib/io.js';
const exec = promisify(execFile), root = fileURLToPath(new URL('..', import.meta.url));
const examples = path.join(root, 'examples'), cli = path.join(root, 'dist/cli.js');
let dir: string, client: Client;
function payload(text: string) { return JSON.parse(text.slice(0,text.lastIndexOf('\nfiles:'))); }
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-test-'));
  client = new Client({ name: 'runtime-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root,'dist/mcp.js')], stderr: 'pipe' }));
});
afterAll(async () => { await client.close(); await fs.rm(dir, { recursive: true, force: true }); });

describe('real CLI and MCP interfaces', () => {
  it('lists exactly three described tools with parameter guidance', async () => {
    const { tools } = await client.listTools(); expect(tools.map(t=>t.name).sort()).toEqual(['check_progress','collect_pages','plan_cache']);
    for (const tool of tools) {
      for (const marker of ['USE WHEN:','PREFER OVER:','DOES NOT:','EXAMPLE:','RETURNS:']) expect(tool.description).toContain(marker);
      for (const schema of Object.values(tool.inputSchema.properties ?? {})) expect((schema as {description?: string}).description).toBeTruthy();
    }
    expect(client.getInstructions()).toContain('Partial collection is never a complete answer');
  });
  for (const [name,file,argument,check] of [
    ['collect_pages','collect.json','config',(r: Record<string,unknown>) => expect(r).toMatchObject({status:'complete',records:3,sums:{cents:'1500'}})],
    ['check_progress','guard-trace.json','path',(r: Record<string,unknown>) => expect(r).toMatchObject({next:{action:'block'}})],
    ['plan_cache','progress-trace.json','path',(r: Record<string,unknown>) => expect(r).toMatchObject({mode:'advisory_only',retain:1,release:1})],
  ] as const) it(`calls ${name} through MCP and reads the resulting artifact`, async () => {
    const r = await client.callTool({ name, arguments: { [argument]:path.join(examples,file),output_dir:dir } });
    expect(r.isError).toBeFalsy(); const text=(r.content as {text:string}[])[0].text;
    expect(Buffer.byteLength(text)).toBeLessThan(16_000); expect(text).toMatch(/files: \d+ · \d+ms$/);
    const data=payload(text); check(data);
    for (const output of data.files) { expect(path.isAbsolute(output)).toBe(true); expect(await fs.stat(output)).toBeTruthy(); }
    expect(text).not.toContain('"id": "A"');
  });
  it('sends committed-page progress over MCP without streaming source records', async () => {
    const updates: {progress:number;message?:string}[]=[];
    // SDK 1.30 defers notification dispatch but synchronously deletes the onprogress
    // callback on a result in the same stdio chunk. Inspect wire notifications directly.
    client.setNotificationHandler(ProgressNotificationSchema,n=>{ if(n.params.progressToken==='page-test')updates.push(n.params); });
    const r=await client.callTool({name:'collect_pages',arguments:{config:path.join(examples,'collect.json'),output_dir:dir},_meta:{progressToken:'page-test'}});
    expect(r.isError).toBeFalsy();expect(updates.map(p=>p.progress)).toEqual([1,2]);expect(updates[1].message).toContain('3 records');
  });
  it('job cancellation preserves the committed page and skips further work', async () => {
    const controller=new AbortController();
    const result=await collectJob({config:path.join(examples,'collect.json'),output_dir:dir},{signal:controller.signal,onProgress:()=>controller.abort()});
    expect(result.summary).toMatchObject({status:'partial',pages:1,reason:'cancelled_or_timeout'});
    const cp=JSON.parse(await fs.readFile(result.files.find(p=>p.endsWith('checkpoint.json'))!,'utf8'));
    expect(cp.state.records).toHaveLength(2);expect(cp.state.nextCursor).toBe('second');
  });
  it('returns bounded teach errors and does not create reports for malformed inputs', async () => {
    const r = await client.callTool({name:'check_progress',arguments:{path:path.join(dir,'missing.json')}});
    expect(r.isError).toBe(true); expect((r.content as {text:string}[])[0].text).toContain('existing readable JSON');
    const bad=path.join(dir,'bad.json'); await fs.writeFile(bad,'{no');
    const result=await client.callTool({name:'plan_cache',arguments:{path:bad}}); expect(result.isError).toBe(true);
  });
  it('CLI documents commands and prints the same collected result', async () => {
    expect((await exec(process.execPath,[cli,'--help'])).stdout).toMatch(/collect.*\n.*check.*\n.*plan/s);
    const {stdout}=await exec(process.execPath,[cli,'collect',path.join(examples,'collect.json'),'--output-dir',dir]);
    expect(payload(stdout.trim())).toMatchObject({status:'complete',records:3});
  });
  it('CLI exits 1 on partial collection and resumes without overwriting original files', async () => {
    const config=path.join(dir,'limited.json'); await fs.writeFile(config,JSON.stringify({source:{type:'file',path:path.join(examples,'pages.json')},key:'id',sumFields:['cents'],maxPages:1}));
    let partial: {files:string[]} | undefined;
    try { await exec(process.execPath,[cli,'collect',config]); throw new Error('Expected nonzero exit'); }
    catch(e) { expect((e as {code:number}).code).toBe(1); partial=payload((e as {stderr:string}).stderr.trim()); }
    const checkpoint=partial!.files.find(f=>f.endsWith('checkpoint.json'))!; const before=await fs.readFile(checkpoint,'utf8');
    const {stdout}=await exec(process.execPath,[cli,'collect',config,'--checkpoint',checkpoint]);
    expect(payload(stdout.trim()).status).toBe('complete'); expect(await fs.readFile(checkpoint,'utf8')).toBe(before);
    expect(payload(stdout.trim()).files).not.toContain(checkpoint);
  });
  it('independent concurrent jobs get unique output directories', async () => {
    const jobs=await Promise.all(Array.from({length:3},()=>collectJob({config:path.join(examples,'collect.json'),output_dir:dir})));
    expect(new Set(jobs.map(j=>j.files[0])).size).toBe(3);
  });
  it('bounds local file reads and rejects directories', async () => {
    await expect(readJson(path.join(examples,'pages.json'),10)).rejects.toThrow(/exceeds/);
    await expect(readJson(examples)).rejects.toThrow(/Expected a file/);
  });
});
