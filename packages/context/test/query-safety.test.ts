// @author AVRG3
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { queryTable } from '../src/lib/query-table.js';
let dir:string, input:string, sentinel:string;
beforeEach(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'table-safety-'));input=path.join(dir,'source.csv');sentinel=path.join(dir,'existing.csv');await fs.writeFile(input,'id,value\n1,10\n2,20\n');await fs.writeFile(sentinel,'KEEP_ME');});
afterEach(async()=>{await fs.rm(dir,{recursive:true,force:true});});
const quote=(s:string)=>s.replace(/'/g,"''");
describe('restricted SQL and exclusive exports',()=>{
 for(const kind of ['copy','multi','attach','set','install','pragma','read','nested','explain','secret','glob','http']) it(`rejects ${kind} without changing files`,async()=>{
  const target=quote(sentinel), nested=`COPY (SELECT 1) TO '${target}'`;
  const queries:Record<string,string>={copy:`COPY (SELECT 'CHANGED') TO '${target}'`,multi:`SELECT 1; COPY (SELECT 'CHANGED') TO '${target}'`,attach:`ATTACH '${target}' AS db`,set:'SET enable_external_access = true',install:'INSTALL httpfs',pragma:'PRAGMA enable_external_access',read:`SELECT * FROM read_text('${target}')`,nested:`SELECT * FROM query('${quote(nested)}')`,explain:`EXPLAIN ANALYZE COPY (SELECT 1) TO '${target}'`,secret:"CREATE SECRET s (TYPE S3, KEY_ID 'x', SECRET 'y')",glob:`SELECT * FROM glob('${quote(dir)}/*')`,http:"SELECT * FROM read_csv('https://invalid.example/data.csv')"};
  await expect(queryTable({path:input,sql:queries[kind]})).rejects.toThrow();
  expect(await fs.readFile(sentinel,'utf8')).toBe('KEEP_ME');expect(await fs.readFile(input,'utf8')).toBe('id,value\n1,10\n2,20\n');
 });
 it('accepts parsed CTEs, comments, semicolons inside strings and DESCRIBE',async()=>{
  expect((await queryTable({path:input,sql:"/* safe */ WITH x AS (SELECT value FROM t) SELECT SUM(value) AS total, ';COPY' AS label FROM x;"})).text).toContain('30');
  expect((await queryTable({path:input,sql:'DESCRIBE t'})).text).toContain('BIGINT');
 });
 it('protects normalized input/output names and pre-existing exports',async()=>{
  await expect(queryTable({path:input,sql:'SELECT * FROM t',out:input.slice(0,-4)})).rejects.toThrow(/same as an input/);
  const result=await queryTable({path:input,sql:'SELECT * FROM t',out:sentinel.slice(0,-4)});
  expect(result.text).toContain('existing-1.csv');expect(await fs.readFile(sentinel,'utf8')).toBe('KEEP_ME');expect(await fs.readFile(path.join(dir,'existing-1.csv'),'utf8')).toBe('id,value\n1,10\n2,20\n');
 });
 it('does not overwrite a symlink destination',async()=>{
  const link=path.join(dir,'linked.csv');await fs.symlink(sentinel,link);
  const result=await queryTable({path:input,sql:'SELECT * FROM t',out:link});expect(result.text).toContain('linked-1.csv');expect(await fs.readFile(sentinel,'utf8')).toBe('KEEP_ME');
 });
 it('concurrent exports choose distinct files without losing a result',async()=>{
  const out=path.join(dir,'result');const results=await Promise.all(Array.from({length:3},()=>queryTable({path:input,sql:'SELECT * FROM t',out})));expect(results).toHaveLength(3);
  const outputs=(await fs.readdir(dir)).filter(f=>/^result.*csv$/.test(f));expect(outputs).toHaveLength(3);for(const f of outputs)expect(await fs.readFile(path.join(dir,f),'utf8')).toBe('id,value\n1,10\n2,20\n');
 });
 it('counts and exports the same single execution including nondeterministic values',async()=>{
  const result=await queryTable({path:input,sql:'SELECT uuid()::VARCHAR AS id FROM range(4)',out:path.join(dir,'random.csv')});
  const exported=(await fs.readFile(path.join(dir,'random.csv'),'utf8')).trim().split('\n').slice(1);expect(exported).toHaveLength(4);for(const id of exported)expect(result.text).toContain(id);
 });
 it('kills an expensive query at its deadline and produces no export',async()=>{
  const start=performance.now();await expect(queryTable({path:input,sql:'WITH RECURSIVE x(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM x WHERE n<1000000000) SELECT SUM(n) FROM x',timeout_ms:200,out:path.join(dir,'timeout.csv')})).rejects.toThrow(/time limit/);
  expect(performance.now()-start).toBeLessThan(5000);await expect(fs.stat(path.join(dir,'timeout.csv'))).rejects.toThrow();expect((await queryTable({path:input,sql:'SELECT SUM(value) FROM t'})).text).toContain('30');
 });
});
