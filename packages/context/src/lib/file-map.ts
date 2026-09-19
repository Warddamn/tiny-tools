import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  type ExtractedText,
  type OutlineItem,
  type SheetMeta,
  type TextBlock,
  boundText,
  detectKind,
  extractText,
  fmtInt,
  parseCsv,
  pathKind,
  teach,
  toAbsolute,
  truncateLine,
  wordCount,
} from "@tinytools/shared";
import type { FileMapArgs } from "../schemas.js";
import { outlineCode } from "./code-outline.js";
import { type LibResult, fmtBytes } from "./result.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv", "venv", "target", ".cache"]);
const MAX_ENTRIES_PER_DIR = 60;
const MAX_TOTAL_ENTRIES = 400;

interface DirStats {
  files: number;
  bytes: number;
}

async function dirStats(dir: string, depthLeft: number): Promise<DirStats> {
  let files = 0;
  let bytes = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { files, bytes };
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (depthLeft <= 0) continue;
      const s = await dirStats(path.join(dir, e.name), depthLeft - 1);
      files += s.files;
      bytes += s.bytes;
    } else if (e.isFile()) {
      files++;
      try {
        bytes += (await fs.stat(path.join(dir, e.name))).size;
      } catch {
        /* ignore */
      }
    }
  }
  return { files, bytes };
}

async function mapDirectory(dir: string, depth: number): Promise<LibResult> {
  const lines: string[] = [];
  const extCounts = new Map<string, number>();
  let totalFiles = 0;
  let totalBytes = 0;
  let listingBytes = 0;
  let shownEntries = 0;
  let capped = false;

  async function walk(d: string, prefix: string, level: number): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch (e) {
      lines.push(`${prefix}(unreadable: ${(e as Error).message})`);
      return;
    }
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    let shown = 0;
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) {
          const s = await dirStats(full, 6);
          totalFiles += s.files;
          totalBytes += s.bytes;
          listingBytes += s.files * (full.length + 24);
          if (shown < MAX_ENTRIES_PER_DIR && shownEntries < MAX_TOTAL_ENTRIES) {
            lines.push(`${prefix}${e.name}/  (${fmtInt(s.files)} files, ${fmtBytes(s.bytes)} — skipped)`);
            shown++;
            shownEntries++;
          }
          continue;
        }
        const s = await dirStats(full, 12);
        totalFiles += s.files;
        totalBytes += s.bytes;
        listingBytes += s.files * (full.length + 24);
        if (shown >= MAX_ENTRIES_PER_DIR || shownEntries >= MAX_TOTAL_ENTRIES) {
          capped = true;
          continue;
        }
        lines.push(`${prefix}${e.name}/  (${fmtInt(s.files)} files, ${fmtBytes(s.bytes)})`);
        shown++;
        shownEntries++;
        if (level < depth) await walk(full, `${prefix}  `, level + 1);
      } else if (e.isFile()) {
        let size = 0;
        try {
          size = (await fs.stat(full)).size;
        } catch {
          /* ignore */
        }
        totalFiles++;
        totalBytes += size;
        listingBytes += full.length + 24;
        const ext = path.extname(e.name).toLowerCase() || "(none)";
        extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
        if (shown >= MAX_ENTRIES_PER_DIR || shownEntries >= MAX_TOTAL_ENTRIES) {
          capped = true;
          continue;
        }
        lines.push(`${prefix}${e.name}  ${fmtBytes(size)}`);
        shown++;
        shownEntries++;
      }
    }
    if (shown < entries.length && (shown >= MAX_ENTRIES_PER_DIR || shownEntries >= MAX_TOTAL_ENTRIES)) {
      lines.push(`${prefix}… +${entries.length - shown} more entries (use a deeper \`path\` to see them)`);
    }
  }

  await walk(dir, "  ", 1);
  const topExt = [...extCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([e, n]) => `${e} ${n}`)
    .join(" · ");
  const head = `${dir}/  — ${fmtInt(totalFiles)} files, ${fmtBytes(totalBytes)} (depth ${depth})`;
  const foot = [`types: ${topExt || "—"}`];
  if (capped) foot.push("listing capped — point `path` at a subfolder for the rest");
  const text = [head, ...lines, ...foot].join("\n");
  return { text: boundText(text, 16_000, "lower `depth` or point `path` at a subfolder").text, rawBytes: Math.max(listingBytes, 1) };
}

function headingTree(blocks: TextBlock[], locKey: "line" | "para", cap = 200): string[] {
  const out: string[] = [];
  const heads = blocks.filter((b) => b.kind === "heading");
  for (let i = 0; i < heads.length && i < cap; i++) {
    const h = heads[i]!;
    const nextIdx = blocks.indexOf(heads[i + 1] ?? (undefined as unknown as TextBlock));
    const startIdx = blocks.indexOf(h);
    const section = blocks.slice(startIdx + 1, nextIdx === -1 ? undefined : nextIdx);
    const words = section.reduce((n, b) => n + wordCount(b.text), 0);
    const title = h.text.replace(/^#+\s*/, "").trim();
    const where = locKey === "line" ? `line ${h.loc.line}` : `¶${h.loc.para}`;
    out.push(`${"  ".repeat(Math.max(0, (h.level ?? 1) - 1))}${"#".repeat(h.level ?? 1)} ${truncateLine(title, 100)}  (${where}, ${fmtInt(words)} words)`);
  }
  if (heads.length > cap) out.push(`… +${heads.length - cap} more headings`);
  return out;
}

function mapMarkdown(ex: ExtractedText): string[] {
  const words = ex.blocks.reduce((n, b) => n + wordCount(b.text), 0);
  const head = `${path.basename(ex.path)} — markdown · ${fmtInt(ex.blocks.length)} lines · ${fmtInt(words)} words · ${fmtBytes(ex.bytes)}`;
  const tree = headingTree(ex.blocks, "line");
  if (tree.length === 0) {
    const first = ex.blocks.find((b) => b.text.trim())?.text ?? "";
    return [head, `  (no headings) first line: ${truncateLine(first, 120)}`, "  read with: read_section({ locator: { lines: '1-80' } })"];
  }
  return [head, ...tree.map((t) => `  ${t}`), "  read a section with: read_section({ locator: { heading: '<title>' } })"];
}

function mapDocx(ex: ExtractedText): string[] {
  const m = ex.meta;
  const head = `${path.basename(ex.path)} — docx · ${fmtInt(Number(m["nonEmptyParagraphs"] ?? 0))} paragraphs · ${fmtInt(Number(m["words"] ?? 0))} words · ${m["tables"] ?? 0} tables · ${fmtBytes(ex.bytes)}${m["title"] ? ` · title: ${m["title"]}` : ""}`;
  const tree = headingTree(ex.blocks, "para");
  if (tree.length === 0) {
    const first = ex.blocks[0]?.text ?? "";
    return [head, `  (no heading styles) first paragraph: ${truncateLine(first, 120)}`, `  read with: read_section({ locator: { paras: '1-40' } })`];
  }
  return [head, ...tree.map((t) => `  ${t}`), "  read a section with: read_section({ locator: { heading: '<title>' } }) or { paras: 'a-b' }"];
}

function mapCode(ex: ExtractedText): string[] {
  const ext = path.extname(ex.path);
  const lines = ex.blocks.map((b) => b.text);
  const { language, signatures, imports } = outlineCode(lines, ext);
  const head = `${path.basename(ex.path)} — ${language ?? "code"} · ${fmtInt(lines.length)} lines · ${fmtBytes(ex.bytes)}`;
  const out = [head];
  const cap = 250;
  for (const s of signatures.slice(0, cap)) {
    const pad = s.indent > 0 ? "  " : "";
    out.push(`  L${String(s.line).padEnd(5)} ${pad}${s.text}`);
  }
  if (signatures.length > cap) out.push(`  … +${signatures.length - cap} more signatures`);
  if (signatures.length === 0) out.push("  (no function/class signatures recognised — try query_file or read_section with a line range)");
  if (imports.length) out.push(`  imports: ${imports.slice(0, 25).join(", ")}${imports.length > 25 ? ` (+${imports.length - 25})` : ""}`);
  return out;
}

function mapXlsx(ex: ExtractedText): string[] {
  const sheets = (ex.meta["sheets"] as SheetMeta[]) ?? [];
  const out = [`${path.basename(ex.path)} — xlsx · ${sheets.length} sheet${sheets.length === 1 ? "" : "s"} · ${fmtBytes(ex.bytes)}`];
  for (const s of sheets) {
    const headers = s.headers.length ? s.headers.map((h) => truncateLine(h, 30)).join(", ") : "(empty)";
    out.push(`  ${s.name}: ${fmtInt(s.rows)} rows × ${s.cols} cols${s.dimension ? ` (${s.dimension})` : ""} — headers: ${truncateLine(headers, 300)}`);
  }
  out.push("  query with: query_table({ sql: 'SELECT … FROM t', sheet: '<name>' }) · read with: read_section({ locator: { sheet: '<name>', range: 'A1:F20' } })");
  return out;
}

function mapPptx(ex: ExtractedText): string[] {
  const titles = (ex.meta["titles"] as string[]) ?? [];
  const out = [`${path.basename(ex.path)} — pptx · ${titles.length} slides · ${fmtInt(Number(ex.meta["words"] ?? 0))} words · ${fmtBytes(ex.bytes)}`];
  titles.slice(0, 150).forEach((t, i) => {
    const n = ex.blocks.filter((b) => b.loc.slide === i + 1).length;
    out.push(`  ${String(i + 1).padStart(3)}. ${truncateLine(t || "(no title)", 100)}  (${n} text lines)`);
  });
  if (titles.length > 150) out.push(`  … +${titles.length - 150} more slides`);
  out.push("  read with: read_section({ locator: { slide: 4 } })");
  return out;
}

function mapPdf(ex: ExtractedText): string[] {
  const pages = Number(ex.meta["pages"] ?? 0);
  const info = (ex.meta["info"] as Record<string, unknown>) ?? {};
  const outline = (ex.meta["outline"] as OutlineItem[]) ?? [];
  const words = ex.blocks.reduce((n, b) => n + wordCount(b.text), 0);
  const out = [
    `${path.basename(ex.path)} — pdf · ${pages} pages · ${fmtInt(words)} words · ${fmtBytes(ex.bytes)}${info["Title"] ? ` · title: ${info["Title"]}` : ""}${ex.meta["scanned"] ? " · NO TEXT LAYER (scanned — OCR needed)" : ""}`,
  ];
  if (outline.length) {
    out.push("  outline:");
    for (const o of outline.slice(0, 80)) out.push(`    ${"  ".repeat(o.level - 1)}${truncateLine(o.title, 90)}${o.page ? `  (page ${o.page})` : ""}`);
    if (outline.length > 80) out.push(`    … +${outline.length - 80} more`);
  }
  const cap = 120;
  out.push("  first line per page:");
  for (let p = 1; p <= Math.min(pages, cap); p++) {
    const first = ex.blocks.find((b) => b.loc.page === p);
    out.push(`    p${p}: ${first ? truncateLine(first.text, 90) : "(no text)"}`);
  }
  if (pages > cap) out.push(`    … +${pages - cap} more pages`);
  out.push("  read with: read_section({ locator: { pages: '3-5' } })");
  return out;
}

function mapCsv(ex: ExtractedText): string[] {
  const text = ex.blocks.map((b) => b.text).join("\n");
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const out = [`${path.basename(ex.path)} — csv · ${fmtInt(Math.max(0, rows.length - 1))} data rows × ${header.length} cols · ${fmtBytes(ex.bytes)}`];
  out.push(`  columns: ${header.map((h) => truncateLine(h, 30)).join(", ")}`);
  if (rows[1]) out.push(`  sample row: ${truncateLine(rows[1].join(" | "), 200)}`);
  out.push("  query with: query_table({ sql: 'SELECT … FROM t' })");
  return out;
}

function describeJson(v: unknown, depth: number, indent: string, out: string[]): void {
  if (Array.isArray(v)) {
    out.push(`${indent}array[${fmtInt(v.length)}]${v.length ? ` of ${typeof v[0] === "object" && v[0] ? (Array.isArray(v[0]) ? "array" : "object") : typeof v[0]}` : ""}`);
    if (depth > 0 && v.length && typeof v[0] === "object" && v[0] && !Array.isArray(v[0])) describeJson(v[0], depth - 1, `${indent}  [0] `, out);
  } else if (v && typeof v === "object") {
    const keys = Object.keys(v as object);
    out.push(`${indent}object{${keys.length} keys}`);
    if (depth > 0) {
      for (const k of keys.slice(0, 40)) {
        const val = (v as Record<string, unknown>)[k];
        const t = Array.isArray(val) ? `array[${val.length}]` : val === null ? "null" : typeof val === "object" ? `object{${Object.keys(val as object).length}}` : typeof val;
        out.push(`${indent}  ${k}: ${t}${typeof val === "string" ? ` "${truncateLine(val, 40)}"` : typeof val === "number" || typeof val === "boolean" ? ` ${val}` : ""}`);
        if (depth > 1 && val && typeof val === "object") describeJson(val, depth - 2, `${indent}    `, out);
      }
      if (keys.length > 40) out.push(`${indent}  … +${keys.length - 40} more keys`);
    }
  } else out.push(`${indent}${typeof v}`);
}

function mapJson(ex: ExtractedText): string[] {
  const text = ex.blocks.map((b) => b.text).join("\n");
  const head = `${path.basename(ex.path)} — json · ${fmtInt(ex.blocks.length)} lines · ${fmtBytes(ex.bytes)}`;
  try {
    const v = JSON.parse(text) as unknown;
    const out = [head];
    describeJson(v, 3, "  ", out);
    out.push("  extract values with: extract({ jq: '.items[].name' })");
    return out;
  } catch {
    const first = ex.blocks[0]?.text ?? "";
    if (first.trim().startsWith("{")) return [head, `  looks like JSON Lines (one object per line): ${fmtInt(ex.blocks.length)} records`, `  first: ${truncateLine(first, 160)}`];
    return [head, "  (not valid JSON — run validate_file for the error location)"];
  }
}

const TS_RE = /\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)/;
function mapLog(ex: ExtractedText): string[] {
  const n = ex.blocks.length;
  const first = ex.blocks.find((b) => TS_RE.test(b.text));
  let last: TextBlock | undefined;
  for (let i = n - 1; i >= Math.max(0, n - 500); i--) {
    if (TS_RE.test(ex.blocks[i]!.text)) {
      last = ex.blocks[i];
      break;
    }
  }
  const levels = new Map<string, number>();
  for (const b of ex.blocks) {
    const m = /\b(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL|PANIC)\b/.exec(b.text);
    if (m) levels.set(m[1]!, (levels.get(m[1]!) ?? 0) + 1);
  }
  const lv = [...levels.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmtInt(v)}`).join(" · ");
  return [
    `${path.basename(ex.path)} — log · ${fmtInt(n)} lines · ${fmtBytes(ex.bytes)}${first && last ? ` · ${TS_RE.exec(first.text)![1]} → ${TS_RE.exec(last.text)![1]}` : ""}`,
    `  levels: ${lv || "(none detected)"}`,
    "  structure with: summarize_log({ focus: 'errors' })",
  ];
}

function mapText(ex: ExtractedText): string[] {
  const words = ex.blocks.reduce((n, b) => n + wordCount(b.text), 0);
  const first = ex.blocks.find((b) => b.text.trim())?.text ?? "";
  return [
    `${path.basename(ex.path)} — text · ${fmtInt(ex.blocks.length)} lines · ${fmtInt(words)} words · ${fmtBytes(ex.bytes)}`,
    `  first line: ${truncateLine(first, 120)}`,
    ex.bytes < 20_000 ? "  small file: Read is fine, or read_section({ locator: { lines: '1-200' } })" : "  read with: read_section({ locator: { lines: '1-200' } }) or search with query_file",
  ];
}

export async function fileMap(args: FileMapArgs): Promise<LibResult> {
  const target = toAbsolute(args.path);
  const kind = await pathKind(target);
  if (kind === "missing") {
    throw teach(`Input not found: ${target}`, "Pass a file or directory path (absolute, '~', or relative to the current directory).");
  }
  if (kind === "dir") return mapDirectory(target, args.depth ?? 2);

  const ex = await extractText(target);
  let lines: string[];
  switch (ex.kind) {
    case "markdown":
      lines = mapMarkdown(ex);
      break;
    case "docx":
      lines = mapDocx(ex);
      break;
    case "code":
      lines = mapCode(ex);
      break;
    case "xlsx":
      lines = mapXlsx(ex);
      break;
    case "pptx":
      lines = mapPptx(ex);
      break;
    case "pdf":
      lines = mapPdf(ex);
      break;
    case "csv":
      lines = mapCsv(ex);
      break;
    case "json":
      lines = mapJson(ex);
      break;
    case "log":
      lines = mapLog(ex);
      break;
    default:
      lines = mapText(ex);
  }
  const bounded = boundText(lines.join("\n"), 16_000, "use query_file to search or read_section for a slice");
  return { text: bounded.text, rawBytes: ex.textBytes };
}

export { detectKind };
