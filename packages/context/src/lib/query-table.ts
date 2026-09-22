// @author AVRG3
import { promises as fs, constants } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fork } from 'node:child_process';
import { boundText, explicitOutputPath, fmtInt, renamedNote, resolveInputs, teach, truncateLine } from '@tiny_tools_pw/shared';
import { QueryTableInput, type QueryTableArgs } from '../schemas.js';
import type { LibResult } from './result.js';
interface Result { ok: boolean; error?: string; names: string[]; types: string[]; rows: string[][]; total: number; note: string }
export async function queryTable(input: QueryTableArgs): Promise<LibResult> {
  const args = QueryTableInput.parse(input);
  const [file] = await resolveInputs(args.path);
  const ext = path.extname(file!).toLowerCase();
  if (!['.csv','.txt','.tsv','.parquet','.xlsx','.xlsm','.json','.jsonl','.ndjson'].includes(ext)) throw teach(`query_table supports CSV, TSV, Parquet, XLSX and JSON — got '${ext}'.`, 'Use CSV/TSV/Parquet/XLSX/JSON.');
  const rawBytes = (await fs.stat(file!)).size;
  if (rawBytes > 64_000_000) throw teach('Table input exceeds 64 MB.', 'Filter or split the source first.');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-table-'));
  try {
    const staged = path.join(dir, `input${ext}`);
    await fs.copyFile(file!, staged);
    if ((await fs.stat(staged)).size > 64_000_000) throw teach('Table input grew beyond 64 MB.', 'Use a stable smaller source.');
    const result = await new Promise<Result>((resolve, reject) => {
      const child = fork(new URL('../../dist/lib/query-table-worker.js', import.meta.url), [], {
        cwd: dir, silent: true, execArgv: ['--max-old-space-size=256'],
        env: { ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR } : {}), HOME: dir, TMPDIR: dir, TEMP: dir, TMP: dir },
      });
      child.stdout?.resume(); child.stderr?.resume();
      let answer: Result | undefined, failure: Error | undefined;
      const timer = setTimeout(() => { failure = teach('Table query exceeded its time limit.', 'Use WHERE/LIMIT, aggregate, or raise timeout_ms (maximum 60 seconds).'); child.kill('SIGKILL'); }, args.timeout_ms ?? 15_000);
      child.once('error', error => { failure = error; });
      child.on('message', message => { answer = message as Result; });
      child.once('close', code => {
        clearTimeout(timer);
        if (failure) reject(failure);
        else if (code !== 0 || !answer) reject(teach('Table worker could not finish (dependency or resource limit).', 'Ensure optional @duckdb/node-api is installed; filter/split large queries.'));
        else if (!answer.ok) reject(teach(answer.error ?? 'SQL failed.', 'Use a single read-only query against t.'));
        else resolve(answer);
      });
      child.send({ file: staged, sql: args.sql, maxRows: args.max_rows ?? 50, export: Boolean(args.out), sheet: args.sheet });
    });
    let wrote = '';
    if (args.out) {
      // Normalize before collision checking; COPYFILE_EXCL prevents race/symlink overwrites.
      const requested = args.out.toLowerCase().endsWith('.csv') ? args.out : `${args.out}.csv`;
      for (let n = 0; ; n++) {
        if (n > 100) throw teach('Output names kept colliding.', 'Choose another output directory.');
        const out = await explicitOutputPath(requested, file!);
        try { await fs.copyFile(path.join(dir,'result.csv'), out.path, constants.COPYFILE_EXCL); wrote = `wrote: ${out.path}${renamedNote(out)} (${fmtInt(result.total)} rows, full result)`; break; }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
      }
    }
    const { names, types, rows, total, note } = result;
    const cell = (v: string) => truncateLine(v,60).replace(/\|/g,'\\|');
    const lines = [`${path.basename(file!)}${note ? ` · ${note}` : ''} · ${fmtInt(total)} result row${total===1?'':'s'}${rows.length<total?` (showing ${rows.length})`:''} · ${names.length} column${names.length===1?'':'s'}`];
    if (rows.length) { lines.push(`| ${names.join(' | ')} |`, `|${names.map(()=>'---').join('|')}|`); for(const row of rows) lines.push(`| ${row.map(cell).join(' | ')} |`); } else lines.push('(no rows)');
    lines.push(`types: ${names.map((name,i)=>`${name} ${types[i]}`).join(' · ')}`);
    if (rows.length<total) lines.push(`capped at ${rows.length} rows — filter/aggregate or pass out for a protected CSV export (64 MB cap)`);
    if(wrote) lines.push(wrote);
    return { text: boundText(lines.join('\n'),16_000,'select fewer columns').text, rawBytes };
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
}
