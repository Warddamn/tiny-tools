// @author AVRG3
import { it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractText } from '../src/extract/index.js';
it('reuses parsing without stale results or cross-call mutation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'extract-cache-')),file=path.join(dir,'sample.txt');
 try{await fs.writeFile(file,'first');const a=await extractText(file);a.blocks[0].text='corrupt caller';expect((await extractText(file)).blocks[0].text).toBe('first');await fs.writeFile(file,'other');expect((await extractText(file)).blocks[0].text).toBe('other');await fs.rm(file);await expect(extractText(file)).rejects.toThrow();}finally{await fs.rm(dir,{recursive:true,force:true});}
});

it('avoids rereading an unchanged file and evicts beyond eight cached files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'extract-lru-'));
 const spy=vi.spyOn(fs,'readFile');
 try {
  const files=Array.from({length:9},(_,i)=>path.join(dir,`file-${i}.txt`));
  for(const file of files)await fs.writeFile(file,'synthetic');
  await extractText(files[0]);const afterFirst=spy.mock.calls.length;
  await extractText(files[0]);expect(spy.mock.calls.length).toBe(afterFirst);
  for(const file of files.slice(1))await extractText(file);
  const beforeEvicted=spy.mock.calls.length;await extractText(files[0]);expect(spy.mock.calls.length).toBe(beforeEvicted+1);
 }finally{spy.mockRestore();await fs.rm(dir,{recursive:true,force:true});}
});
