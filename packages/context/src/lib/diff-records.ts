// @author AVRG3
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { boundText, explicitOutputPath, resolveInputs, teach } from "@tiny_tools_pw/shared";
import type { DiffFilesArgs } from "../schemas.js";
import type { LibResult } from "./result.js";
import { parseExactJson } from "./strict-json.js";

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_RECORDS = 100_000;
type RecordValue = Record<string, unknown>;
type Cell = { present: false } | { present: true; value: unknown };
export interface RecordChange { kind: "added" | "removed" | "changed"; key: unknown[]; before_row?: number; after_row?: number; fields: Array<{ path: string; before: Cell; after: Cell }> }
export interface RecordComparison {
  counts: { before: number; after: number; added: number; removed: number; changed: number; unchanged: number };
  changes: RecordChange[];
}

function tokens(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/") || /~(?![01])/.test(pointer)) throw teach(`Invalid JSON Pointer: ${JSON.stringify(pointer)}.`, "Use /id or /customer/name; escape ~ as ~0 and / as ~1. Use an empty records_path for a root array.");
  return pointer.slice(1).split("/").map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}
function cell(value: unknown, segments: string[]): Cell {
  let current = value;
  for (const segment of segments) {
    if (current === null || typeof current !== "object" || (Array.isArray(current) && !/^(0|[1-9]\d*)$/.test(segment)) || !Object.hasOwn(current, segment)) return { present: false };
    current = (current as RecordValue)[segment];
  }
  return { present: true, value: current };
}
const pointerFor = (key: string): string => "/" + key.replace(/~/g, "~0").replace(/\//g, "~1");

/** Explicit record identity; ordering of records/JSON object keys is irrelevant, nested arrays remain ordered. */
export function compareRecords(before: unknown[], after: unknown[], keyPaths: string[], fields?: string[]): RecordComparison {
  if (!keyPaths.length) throw teach("Record comparison requires key.", "Pass key: ['/id'] or several JSON Pointers for a composite identity.");
  if (before.length > MAX_RECORDS || after.length > MAX_RECORDS) throw teach("Record limit exceeded (100000 per file).", "Filter or split the snapshots before comparison.");
  const keys = keyPaths.map(tokens); const selected = fields?.map(p => ({ path: p, segments: tokens(p) }));
  const seenFields = new Set<string>();
  const index = (rows: unknown[], side: string): Map<string, { value: RecordValue; row: number; key: unknown[] }> => {
    const map = new Map<string, { value: RecordValue; row: number; key: unknown[] }>();
    for (const [n, row] of rows.entries()) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) throw teach(`${side} record ${n + 1} is not an object.`, "Supply an array of objects or JSONL objects; records_path selects an array inside JSON.");
      const key = keys.map(p => {
        const c = cell(row, p);
        if (!c.present || !["string", "number"].includes(typeof c.value) || c.value === "" || (typeof c.value === "number" && !Number.isFinite(c.value))) throw teach(`${side} record ${n + 1} has a missing, empty or invalid key.`, "Each key must be a nonempty string or finite number; choose stable unique key pointers.");
        return c.value;
      });
      const id = JSON.stringify(key);
      if (map.has(id)) throw teach(`${side} has duplicate keys at records ${map.get(id)!.row} and ${n + 1}.`, "Choose a unique key or composite key. No comparison was returned.");
      for (const f of selected ?? []) if (cell(row, f.segments).present) seenFields.add(f.path);
      map.set(id, { value: row as RecordValue, row: n + 1, key });
    }
    return map;
  };
  const a = index(before, "Before"), b = index(after, "After");
  for (const f of selected ?? []) if (before.length + after.length > 0 && !seenFields.has(f.path)) throw teach(`Selected field ${JSON.stringify(f.path)} is absent from both snapshots.`, "Correct the field pointer; omit fields to compare every field.");
  const result: RecordComparison = { counts: { before: before.length, after: after.length, added: 0, removed: 0, changed: 0, unchanged: 0 }, changes: [] };
  let comparisons = 0, changedFields = 0;
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const old = a.get(id), next = b.get(id);
    const paths = selected ?? [...new Set([...Object.keys(old?.value ?? {}), ...Object.keys(next?.value ?? {})])].sort().map(p => ({ path: pointerFor(p), segments: [p] }));
    const changed: RecordChange["fields"] = [];
    for (const p of paths) {
      if (++comparisons > 1_000_000) throw teach("Comparison exceeds 1000000 field checks.", "Select fewer fields or split the snapshots.");
      const was = old ? cell(old.value, p.segments) : { present: false as const };
      const now = next ? cell(next.value, p.segments) : { present: false as const };
      if (!isDeepStrictEqual(was, now)) {
        if (++changedFields > 200_000) throw teach("Comparison exceeds 200000 changed fields.", "Select fewer fields or split the snapshots.");
        changed.push({ path: p.path, before: was, after: now });
      }
    }
    const kind = !old ? "added" : !next ? "removed" : changed.length ? "changed" : "unchanged";
    result.counts[kind]++;
    if (kind !== "unchanged") result.changes.push({ kind, key: (old ?? next)!.key, ...(old ? { before_row: old.row } : {}), ...(next ? { after_row: next.row } : {}), fields: changed });
  }
  return result;
}

async function readSnapshot(file: string, recordsPath: string): Promise<{ rows: unknown[]; bytes: number }> {
  const ext = path.extname(file).toLowerCase();
  if (![".json", ".jsonl", ".ndjson"].includes(ext)) throw teach("Record mode supports .json, .jsonl and .ndjson only.", "Use summary/unified for other file types, or export the records as JSON.");
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  let buffer: Buffer;
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.size > BigInt(MAX_BYTES)) throw teach("Record comparison requires regular files up to 16 MiB each.", "Filter or split the snapshots before comparison.");
    const data = Buffer.alloc(Number(stat.size) + 1); let offset = 0;
    while (offset < data.length) {
      const read = await handle.read(data, offset, data.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    const end = await handle.stat({ bigint: true });
    if (offset !== Number(stat.size) || stat.size !== end.size || stat.mtimeNs !== end.mtimeNs || stat.ctimeNs !== end.ctimeNs) throw teach("Snapshot changed while being read.", "Save a stable snapshot, then retry.");
    buffer = data.subarray(0, offset);
  } finally { await handle.close(); }
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { throw teach("Snapshot is not UTF-8 text.", "Export JSON/JSONL as UTF-8 and retry."); }
  let rows: unknown;
  if (ext === ".json") {
    const found = cell(parseExactJson(text), tokens(recordsPath));
    rows = found.present ? found.value : undefined;
  } else {
    if (recordsPath !== "") throw teach("records_path only applies to JSON files.", "Omit records_path for JSONL/NDJSON; every nonblank line is a record.");
    rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => parseExactJson(l));
  }
  if (!Array.isArray(rows)) throw teach("Selected snapshot value is not an array.", "Set records_path to the JSON Pointer of the records array, e.g. '/orders'; omit for a root array.");
  return { rows, bytes: buffer.byteLength };
}

/** Complete local report is opt-in; exclusive create prevents overwrite even on collisions/symlinks. */
async function exportReport(requested: string, inputs: string[], header: unknown, changes: RecordChange[]): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const out = await explicitOutputPath(requested, inputs);
    let handle;
    try { handle = await fs.open(out.path, "wx", 0o600); } catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") continue; throw e; }
    try {
      let bytes = 0;
      for (const row of [header, ...changes]) {
        const line = JSON.stringify(row) + "\n"; bytes += Buffer.byteLength(line);
        if (bytes > 64 * 1024 * 1024) throw teach("Full change report exceeds 64 MiB.", "Select fewer fields or split the snapshots; no report was retained.");
        await handle.writeFile(line);
      }
      await handle.close(); return out.path;
    } catch (e) { await handle.close(); await fs.unlink(out.path); throw e; }
  }
  throw teach("Output path is busy.", "Choose another output name.");
}

export async function diffRecords(args: DiffFilesArgs): Promise<LibResult> {
  // resolveInputs sorts/deduplicates: preserve before/after identity and forbid globs here.
  const aa = await resolveInputs(args.a), bb = await resolveInputs(args.b);
  if (aa.length !== 1 || bb.length !== 1) throw teach("Record mode requires exactly one before and one after file.", "Pass two explicit file paths, not multi-file globs.");
  const a = aa[0]!, b = bb[0]!;
  const [old, next] = await Promise.all([readSnapshot(a, args.records_path ?? ""), readSnapshot(b, args.records_path ?? "")]);
  const result = compareRecords(old.rows, next.rows, args.key ?? [], args.fields);
  const scope = { key: args.key, records_path: args.records_path ?? "", fields: args.fields ?? "all fields", record_order: "ignored", nested_array_order: "significant" };
  const report = args.out ? await exportReport(args.out, [a, b], { type: "summary", before: a, after: b, scope, counts: result.counts }, result.changes) : undefined;
  const lines = [`Record comparison (exact within scope): ${JSON.stringify(result.counts)}`, `Scope: ${JSON.stringify(scope)}`, `Before: ${JSON.stringify(a)}\nAfter: ${JSON.stringify(b)}`];
  if (args.fields) lines.push("Only selected fields compared; changes elsewhere are excluded. Missing is distinct from null.");
  if (report) lines.push(`Complete JSONL report: ${JSON.stringify(report)}`);
  let shown = 0; let clipped = false;
  for (const change of result.changes.slice(0, args.max_hunks ?? 20)) {
    const serialized = JSON.stringify(change);
    const bytes = Buffer.from(serialized);
    const entry = bytes.length > 1200 ? bytes.subarray(0, 1197).toString("utf8") + "… [record preview clipped]" : serialized;
    if (Buffer.byteLength(lines.join("\n")) + Buffer.byteLength(entry) > 14_000) break;
    lines.push(entry); shown++; if (bytes.length > 1200) clipped = true;
  }
  lines.push(`Preview: ${shown}/${result.changes.length} changed records${clipped ? "; values clipped" : ""}. Counts cover every record. ${report ? "Use the complete report for all values." : "Set out to save every change as JSONL; inputs are never modified."}`);
  return { text: boundText(lines.join("\n"), 15_500, "shorten paths/field selection; use out for a complete report").text, rawBytes: old.bytes + next.bytes };
}
