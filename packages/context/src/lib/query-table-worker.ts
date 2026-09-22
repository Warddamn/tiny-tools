// @author AVRG3
// Runs in a disposable process: no inherited credentials, bounded heap/engine memory and parent-enforced deadline.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { type SheetMeta, colToIndex, extractText, fmtInt, splitRef, teach, toCsvLine } from '@tiny_tools_pw/shared';
import { DuckDBInstance, StatementType } from '@duckdb/node-api';
const q = (s: string): string => s.replace(/'/g, "''");
/** XLSX sheet → temp CSV (DuckDB's excel extension would need a network download). */
async function xlsxToCsv(file: string, sheet: string | undefined): Promise<{ csv: string; sheetName: string; rows: number }> {
  const ex = await extractText(file);
  const sheets = (ex.meta["sheets"] as SheetMeta[]) ?? [];
  if (sheets.length === 0) throw teach(`${path.basename(file)} has no sheets.`, "Check the workbook in Excel.");
  const meta = sheet
    ? (sheets.find((s) => s.name === sheet) ?? sheets.find((s) => s.name.toLowerCase() === sheet.toLowerCase()))
    : sheets[0];
  if (!meta) throw teach(`No sheet named "${sheet}".`, `Sheets: ${sheets.map((s) => s.name).join(", ")}.`);
  const blocks = ex.blocks.filter((b) => b.loc.sheet === meta.name);
  const cols = Math.max(meta.cols, 1);
  const lines: string[] = [];
  for (const b of blocks) {
    const row: string[] = new Array<string>(cols).fill("");
    for (const c of b.cells ?? []) {
      const idx = colToIndex(splitRef(c.ref).col) - 1;
      if (idx >= 0 && idx < cols) row[idx] = c.value;
    }
    lines.push(toCsvLine(row));
  }
  const dir = process.cwd();
  await fs.mkdir(dir, { recursive: true });
  const csv = path.join(dir, `xlsx-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.csv`);
  await fs.writeFile(csv, `${lines.join("\n")}\n`, "utf8");
  return { csv, sheetName: meta.name, rows: Math.max(0, lines.length - 1) };
}

interface Request { file: string; sql: string; maxRows: number; export: boolean; sheet?: string }
process.once('message', async (raw: Request) => {
  let instance: Awaited<ReturnType<typeof DuckDBInstance.create>> | undefined;
  let conn: Awaited<ReturnType<NonNullable<typeof instance>['connect']>> | undefined;
  let output: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    instance = await DuckDBInstance.create(':memory:', {
      memory_limit: '256MB', threads: '2', temp_directory: '',
      autoinstall_known_extensions: 'false', autoload_known_extensions: 'false',
      allow_community_extensions: 'false', allow_unsigned_extensions: 'false',
    });
    conn = await instance.connect();
    const ext = path.extname(raw.file).toLowerCase();
    let input = raw.file, note = '';
    if (ext === '.xlsx' || ext === '.xlsm') { const x = await xlsxToCsv(input, raw.sheet); input = x.csv; note = `sheet "${x.sheetName}" (${fmtInt(x.rows)} rows)`; }
    const source = ext === '.parquet' ? `read_parquet('${q(input)}')`
      : ['.json','.jsonl','.ndjson'].includes(ext) ? `read_json_auto('${q(input)}')`
      : `read_csv('${q(input)}', header=true, auto_detect=true, sample_size=20480${ext === '.tsv' ? ", delim='\\t'" : ''})`;
    // Only trusted SQL can touch files. Materialize the explicit input before locking external access.
    await conn.run(`CREATE TABLE t AS SELECT * FROM ${source}`);
    await conn.run('SET enable_external_access = false');
    await conn.run('SET lock_configuration = true');
    const columns = (await conn.runAndReadAll('DESCRIBE t')).getRowsJson().map(row => `${row[0]} ${row[1]}`).join(', ');
    let names: string[], types: string[], rows: unknown[][] = [], total = 0, bytes = 0;
    try {
      const extracted = await conn.extractStatements(raw.sql);
      if (extracted.count !== 1) throw new Error('Exactly one read-only SELECT query is allowed.');
      const statement = await extracted.prepare(0);
      // DuckDB parses DESCRIBE/SUMMARIZE as SELECT too; COPY, PRAGMA, SET, ATTACH, etc. are rejected.
      if (statement.statementType !== StatementType.SELECT) throw new Error('Only read-only SELECT/DESCRIBE queries are allowed. Use out for a protected CSV export.');
      const result = await statement.stream();
      names = result.columnNames(); types = result.columnTypes().map(String);
      if (names.length > 1000) throw new Error('Result exceeds 1000 columns. Select fewer columns.');
      const write = async (text: string) => {
        bytes += Buffer.byteLength(text); if (bytes > 64_000_000) throw new Error('CSV export exceeds 64 MB. Filter or split the query.');
        await output!.writeFile(text);
      };
      if (raw.export) { output = await fs.open('result.csv', 'wx', 0o600); await write(toCsvLine(names)+'\n'); }
      // Execute once: count, preview and optional export consume the same stream.
      for await (const chunk of result.yieldRowsJson()) {
        total += chunk.length;
        for (const row of chunk) {
          if (rows.length < raw.maxRows) rows.push(row.map(v => {
            const text = v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v);
            return text.length <= 120 ? text : text.slice(0,117)+'…';
          }));
        }
        if (output) await write(chunk.map(row => toCsvLine(row.map(v => v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)))).join('\n')+'\n');
      }
      statement.destroySync();
    } catch (e) { throw new Error(`SQL error: ${(e as Error).message.split('\n')[0]}. The file is table t with columns: ${columns}. Use a single read-only query against t.`); }
    await output?.close(); output = undefined;
    process.send?.({ ok: true, names, types, rows, total, note });
  } catch (e) { process.send?.({ ok: false, error: String((e as Error).message).slice(0,3000) }); }
  finally { await output?.close().catch(()=>{}); conn?.closeSync(); instance?.closeSync(); process.disconnect?.(); }
});
