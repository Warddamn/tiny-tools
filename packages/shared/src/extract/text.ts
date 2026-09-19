// @author AVRG3
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { teach } from "../errors.js";
import type { DocKind, ExtractedText, TextBlock } from "./types.js";

export const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".kts", ".c", ".h", ".cpp", ".hpp",
  ".cc", ".cs", ".rb", ".php", ".swift", ".scala", ".sh", ".bash", ".zsh", ".sql", ".lua", ".r", ".m", ".mm", ".dart",
  ".ex", ".exs", ".hs", ".clj", ".vue", ".svelte", ".css", ".scss", ".html", ".htm", ".xml", ".yaml", ".yml", ".toml",
]);
export const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);

/** Max size we will load into memory for extraction (64 MB). Bigger → teach-error pointing at streaming tools. */
export const MAX_TEXT_BYTES = 64 * 1024 * 1024;

export function detectKind(file: string): DocKind {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".pptx") return "pptx";
  if (ext === ".xlsx" || ext === ".xlsm") return "xlsx";
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (ext === ".log") return "log";
  if (ext === ".json" || ext === ".jsonl" || ext === ".ndjson") return "json";
  if (ext === ".csv" || ext === ".tsv") return "csv";
  return "text";
}

export function isProbablyBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Decode with BOM handling (UTF-8 / UTF-16 LE / UTF-16 BE). */
export function decodeText(buf: Buffer): { text: string; bom: "utf8" | "utf16le" | "utf16be" | null } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.subarray(3).toString("utf8"), bom: "utf8" };
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString("utf16le"), bom: "utf16le" };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return { text: swapped.toString("utf16le"), bom: "utf16be" };
  }
  return { text: buf.toString("utf8"), bom: null };
}

const ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Split text into line blocks. Markdown gets heading blocks + heading paths (fence-aware). */
export function textToBlocks(text: string, kind: DocKind): TextBlock[] {
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (lines.length && lines[lines.length - 1] === "" && text.endsWith("\n")) lines.pop();
  const blocks: TextBlock[] = [];
  if (kind !== "markdown") {
    const k = kind === "code" ? "code" : "text";
    for (let i = 0; i < lines.length; i++) blocks.push({ text: lines[i]!, loc: { line: i + 1 }, kind: k });
    return blocks;
  }
  const stack: Array<{ level: number; text: string }> = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    let level = 0;
    let title = "";
    if (!inFence) {
      const m = ATX.exec(line);
      if (m) {
        level = m[1]!.length;
        title = m[2]!.trim();
      } else if (line.trim() && i + 1 < lines.length && !/^\s*[-*+]\s|^\s*\d+\.\s|^\s*\|/.test(line)) {
        const next = lines[i + 1]!;
        if (/^=+\s*$/.test(next)) {
          level = 1;
          title = line.trim();
        } else if (/^-{3,}\s*$/.test(next) && !/^\s*$/.test(line) && !line.includes("|")) {
          level = 2;
          title = line.trim();
        }
      }
    }
    if (level > 0) {
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      stack.push({ level, text: title });
      blocks.push({ text: line, loc: { line: lineNo, heading: stack.map((s) => s.text) }, kind: "heading", level });
    } else {
      blocks.push({ text: line, loc: { line: lineNo, heading: stack.map((s) => s.text) }, kind: inFence ? "code" : "text" });
    }
  }
  return blocks;
}

export async function extractPlain(file: string, kind: DocKind): Promise<ExtractedText> {
  const st = await fs.stat(file);
  if (st.size > MAX_TEXT_BYTES) {
    throw teach(
      `${file} is ${(st.size / 1048576).toFixed(0)} MB — over the ${MAX_TEXT_BYTES / 1048576} MB extraction limit.`,
      "Use summarize_log (logs), query_table (tables) or extract (regex) which stream the file, or split it first.",
    );
  }
  const buf = await fs.readFile(file);
  if (isProbablyBinary(buf)) {
    throw teach(
      `${file} looks like a binary file (contains NUL bytes).`,
      "Supported: txt/md/code/log/json/csv/pdf/docx/pptx/xlsx. Rename or convert the file if it is really text.",
    );
  }
  const { text, bom } = decodeText(buf);
  const blocks = textToBlocks(text, kind);
  const headings = blocks.filter((b) => b.kind === "heading").length;
  return {
    path: file,
    kind,
    bytes: st.size,
    textBytes: Buffer.byteLength(text, "utf8"),
    blocks,
    meta: { lines: blocks.length, headings, bom },
  };
}
