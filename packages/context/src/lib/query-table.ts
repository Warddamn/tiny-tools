import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type SheetMeta,
  boundText,
  colToIndex,
  explicitOutputPath,
  extractText,
  fmtInt,
  renamedNote,
  resolveInputs,
  splitRef,
  teach,
  toCsvLine,
  truncateLine,
} from "@tinytools/shared";
import type { QueryTableArgs } from "../schemas.js";
import type { LibResult } from "./result.js";

type Duck = typeof import("@duckdb/node-api");
let duckMod: Promise<Duck> | null = null;

/** Lazy-load the optional native dependency; teach-error when it is missing. */
async function loadDuck(): Promise<Duck> {
  if (!duckMod) {
    duckMod = import("@duckdb/node-api").catch((e: unknown) => {
      duckMod = null;
      const msg = ((e as Error)?.message ?? String(e)).split("\n")[0];
      throw teach(
        `DuckDB is not available (${msg}).`,
        "It is an optional native dependency of @tinytools/context — run `npm install @duckdb/node-api` inside the tiny-tools install (macOS/Linux/Windows, x64/arm64), then retry.",
      );
    });
  }
  return duckMod;
}

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
  const dir = path.join(os.tmpdir(), "tiny-tools");
  await fs.mkdir(dir, { recursive: true });
  const csv = path.join(dir, `xlsx-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.csv`);
  await fs.writeFile(csv, `${lines.join("\n")}\n`, "utf8");
  return { csv, sheetName: meta.name, rows: Math.max(0, lines.length - 1) };
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return truncateLine(s, 60).replace(/\|/g, "\\|");
}

export async function queryTable(args: QueryTableArgs): Promise<LibResult> {
  const [file] = await resolveInputs(args.path);
  const sql = args.sql.trim().replace(/;+\s*$/, "");
  if (!sql) throw teach("Empty SQL.", "Example: SELECT region, SUM(total) FROM t GROUP BY 1");
  const maxRows = args.max_rows ?? 50;
  const ext = path.extname(file!).toLowerCase();
  const rawBytes = (await fs.stat(file!)).size;

  let source = "";
  let note = "";
  let tempCsv: string | null = null;
  if (ext === ".parquet") source = `read_parquet('${q(file!)}')`;
  else if (ext === ".csv" || ext === ".txt") source = `read_csv('${q(file!)}', header=true, auto_detect=true, sample_size=-1)`;
  else if (ext === ".tsv") source = `read_csv('${q(file!)}', header=true, auto_detect=true, delim='\\t', sample_size=-1)`;
  else if (ext === ".json" || ext === ".jsonl" || ext === ".ndjson") source = `read_json_auto('${q(file!)}')`;
  else if (ext === ".xlsx" || ext === ".xlsm") {
    const r = await xlsxToCsv(file!, args.sheet);
    tempCsv = r.csv;
    source = `read_csv('${q(r.csv)}', header=true, auto_detect=true, sample_size=-1)`;
    note = `sheet "${r.sheetName}" (${fmtInt(r.rows)} rows)`;
  } else {
    throw teach(`query_table supports CSV, TSV, Parquet, XLSX and JSON — got '${ext || "no extension"}'.`, "Convert the file, or use query_file / read_section for documents.");
  }

  const duck = await loadDuck();
  const instance = await duck.DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  try {
    try {
      await conn.run(`CREATE VIEW t AS SELECT * FROM ${source}`);
    } catch (e) {
      throw teach(
        `Could not read ${path.basename(file!)} as a table: ${((e as Error).message ?? "").split("\n")[0]}`,
        "Check the file is a well-formed CSV/TSV/Parquet/XLSX; validate_file can point at CSV problems.",
      );
    }
    const describe = async (): Promise<string> => {
      try {
        const r = await conn.runAndReadAll("DESCRIBE t");
        return r
          .getRowsJson()
          .map((row) => `${String(row[0])} ${String(row[1])}`)
          .join(", ");
      } catch {
        return "(unavailable)";
      }
    };

    const isSelect = /^\s*(select|with|from|pivot|unpivot|values|summarize)\b/i.test(sql);
    let total: number | null = null;
    if (isSelect) {
      try {
        const c = await conn.runAndReadAll(`SELECT COUNT(*) AS n FROM (${sql}) AS _q`);
        total = Number(c.getRowsJson()[0]?.[0] ?? 0);
      } catch {
        total = null;
      }
    }
    let reader: Awaited<ReturnType<typeof conn.runAndReadUntil>>;
    try {
      reader = await conn.runAndReadUntil(sql, maxRows + 1);
    } catch (e) {
      const cols = await describe();
      throw teach(
        `SQL error: ${((e as Error).message ?? "").split("\n").slice(0, 2).join(" ").trim()}`,
        `The file is table \`t\` with columns: ${cols}. Fix the query and retry.`,
      );
    }
    const names = reader.columnNames();
    const types = reader.columnTypes().map((t) => String(t));
    const all = reader.getRowsJson();
    const rows = all.slice(0, maxRows);
    if (total === null) total = all.length;

    let wrote = "";
    if (args.out) {
      const out = await explicitOutputPath(args.out, file!);
      const outPath = out.path.toLowerCase().endsWith(".csv") ? out.path : `${out.path}.csv`;
      await conn.run(`COPY (${sql}) TO '${q(outPath)}' (HEADER, DELIMITER ',')`);
      wrote = `wrote: ${outPath}${renamedNote(out)} (${fmtInt(total)} rows, full result)`;
    }

    const lines: string[] = [];
    lines.push(
      `${path.basename(file!)}${note ? ` · ${note}` : ""} · ${fmtInt(total)} result row${total === 1 ? "" : "s"}${rows.length < total ? ` (showing ${rows.length})` : ""} · ${names.length} column${names.length === 1 ? "" : "s"}`,
    );
    if (rows.length) {
      lines.push(`| ${names.join(" | ")} |`);
      lines.push(`|${names.map(() => "---").join("|")}|`);
      for (const r of rows) lines.push(`| ${r.map(cell).join(" | ")} |`);
    } else lines.push("(no rows)");
    lines.push(`types: ${names.map((n, i) => `${n} ${types[i]}`).join(" · ")}`);
    if (rows.length < total) lines.push(`capped at ${rows.length} rows — add WHERE/LIMIT, aggregate, or pass \`out\` to write the full ${fmtInt(total)} rows to CSV (max_rows cap 200)`);
    if (wrote) lines.push(wrote);
    const bounded = boundText(lines.join("\n"), 16_000, "lower max_rows or select fewer columns");
    return { text: bounded.text, rawBytes };
  } finally {
    try {
      conn.closeSync();
    } catch {
      /* ignore */
    }
    try {
      instance.closeSync();
    } catch {
      /* ignore */
    }
    if (tempCsv) await fs.rm(tempCsv, { force: true }).catch(() => undefined);
  }
}
