// @author AVRG3
import * as path from "node:path";
import {
  type ExtractedText,
  type Location,
  type TextBlock,
  boundText,
  extractText,
  fmtInt,
  formatError,
  formatLocation,
  resolveInputs,
  teach,
  truncateLine,
} from "@tinytools/shared";
import type { QueryFileArgs } from "../schemas.js";
import type { LibResult } from "./result.js";

const STOP = new Set(
  "the a an and or of to in on for is are was were be by with as at it this that these those from not but if then than so we you they he she i its our your their will shall may can do does did has have had any all such which who what when where how".split(" "),
);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().split(/[^a-z0-9_]+/)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

export interface Chunk {
  ex: ExtractedText;
  start: number;
  end: number;
  text: string;
}

function isBoundary(prev: TextBlock, cur: TextBlock): boolean {
  if (cur.kind === "heading" || cur.kind === "title") return true;
  return prev.loc.page !== cur.loc.page || prev.loc.slide !== cur.loc.slide || prev.loc.sheet !== cur.loc.sheet;
}

/** Group consecutive blocks into passages (~700 chars / ≤12 blocks), breaking at headings, pages, slides, sheets and blank lines. */
export function chunkBlocks(ex: ExtractedText, maxChars = 700, maxBlocks = 12): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let chars = 0;
  let count = 0;
  const flush = (end: number): void => {
    if (end > start) {
      const text = ex.blocks
        .slice(start, end)
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) chunks.push({ ex, start, end, text });
    }
    start = end;
    chars = 0;
    count = 0;
  };
  for (let i = 0; i < ex.blocks.length; i++) {
    const b = ex.blocks[i]!;
    const blank = !b.text.trim();
    if (i > start && (isBoundary(ex.blocks[i - 1]!, b) || (blank && chars > maxChars / 3) || chars + b.text.length > maxChars || count >= maxBlocks)) flush(i);
    chars += b.text.length + 1;
    count++;
  }
  flush(ex.blocks.length);
  return chunks;
}

/** BM25 over chunk texts. Returns score per chunk index (0 = no term overlap). */
export function bm25(chunks: Chunk[], queryTokens: string[], k1 = 1.2, b = 0.75): number[] {
  const docs = chunks.map((c) => tokenize(c.text));
  const N = docs.length || 1;
  const avgdl = docs.reduce((n, d) => n + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  const uniqQ = [...new Set(queryTokens)];
  for (const d of docs) {
    const seen = new Set(d);
    for (const q of uniqQ) if (seen.has(q)) df.set(q, (df.get(q) ?? 0) + 1);
  }
  return docs.map((d) => {
    if (d.length === 0) return 0;
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const q of uniqQ) {
      const f = tf.get(q) ?? 0;
      if (!f) continue;
      const n = df.get(q) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgdl)));
    }
    return score;
  });
}

function spanLabel(startLoc: Location, endLoc: Location): string {
  const heading = startLoc.heading?.length ? ` (${startLoc.heading.join(" > ")})` : "";
  if (startLoc.page !== undefined) {
    if (endLoc.page !== undefined && endLoc.page !== startLoc.page) return `pages ${startLoc.page}–${endLoc.page}`;
    return `page ${startLoc.page}${startLoc.line !== undefined ? `, line${endLoc.line !== undefined && endLoc.line !== startLoc.line ? `s ${startLoc.line}–${endLoc.line}` : ` ${startLoc.line}`}` : ""}`;
  }
  if (startLoc.sheet !== undefined) return `${startLoc.sheet} rows ${startLoc.row}${endLoc.row !== undefined && endLoc.row !== startLoc.row ? `–${endLoc.row}` : ""}`;
  if (startLoc.slide !== undefined) return `slide ${startLoc.slide}${endLoc.slide !== undefined && endLoc.slide !== startLoc.slide ? `–${endLoc.slide}` : ""}`;
  if (startLoc.para !== undefined) return `¶${startLoc.para}${endLoc.para !== undefined && endLoc.para !== startLoc.para ? `–${endLoc.para}` : ""}${heading}`;
  if (startLoc.line !== undefined) return `line${endLoc.line !== undefined && endLoc.line !== startLoc.line ? `s ${startLoc.line}–${endLoc.line}` : ` ${startLoc.line}`}${heading}`;
  return formatLocation(startLoc);
}

function excerpt(chunk: Chunk, matchLine: (s: string) => boolean, ctx: number, maxLines = 10): string[] {
  const blocks = chunk.ex.blocks.slice(chunk.start, chunk.end);
  const hits = new Set<number>();
  blocks.forEach((b, i) => {
    if (matchLine(b.text)) for (let j = Math.max(0, i - ctx); j <= Math.min(blocks.length - 1, i + ctx); j++) hits.add(j);
  });
  const idx = hits.size ? [...hits].sort((a, b) => a - b) : blocks.map((_, i) => i).slice(0, 3);
  const out: string[] = [];
  let last = -2;
  for (const i of idx) {
    if (out.length >= maxLines) {
      out.push("   …");
      break;
    }
    if (i !== last + 1 && last >= 0) out.push("   …");
    const b = blocks[i]!;
    if (!b.text.trim()) {
      last = i;
      continue;
    }
    out.push(`   ${truncateLine(b.text, 200)}`);
    last = i;
  }
  return out;
}

export async function queryFile(args: QueryFileArgs): Promise<LibResult> {
  const patterns = [...(args.path ? [args.path] : []), ...(args.paths ?? [])];
  if (patterns.length === 0) throw teach("No `path` or `paths` given.", "Pass a file, a glob like '/abs/docs/*.pdf', or a list of them.");
  const files = await resolveInputs(patterns);
  const query = args.query.trim();
  const maxResults = args.max_results ?? 8;
  const ctx = args.context_lines ?? 2;

  let regex: RegExp | null = null;
  if (args.regex) {
    try {
      regex = new RegExp(query, "i");
    } catch (e) {
      throw teach(`Invalid regular expression '${query}': ${(e as Error).message}`, "Fix the pattern or drop `regex: true` for keyword search.");
    }
  }
  const qTokens = tokenize(query);
  if (!regex && qTokens.length === 0) throw teach(`Query '${query}' has no searchable words.`, "Use words or a phrase (stop-words alone are ignored), or pass `regex: true`.");

  const chunks: Chunk[] = [];
  const skipped: string[] = [];
  let rawBytes = 0;
  let scannedFiles = 0;
  for (const f of files) {
    try {
      const ex = await extractText(f);
      rawBytes += ex.textBytes;
      scannedFiles++;
      chunks.push(...chunkBlocks(ex));
    } catch (e) {
      skipped.push(`${path.basename(f)} (${truncateLine(formatError(e), 140)})`);
    }
  }
  if (chunks.length === 0 && scannedFiles === 0) {
    throw teach(`None of the ${files.length} input(s) could be read:\n  - ${skipped.join("\n  - ")}`, "Supported: txt/md/code/log/json/csv/pdf/docx/pptx/xlsx.");
  }

  const scores: number[] = regex
    ? chunks.map((c) => {
        const m = c.text.match(new RegExp(regex!.source, "gi"));
        return m ? m.length : 0;
      })
    : bm25(chunks, qTokens);
  if (!regex) {
    const phrase = query.toLowerCase();
    if (phrase.length >= 3) chunks.forEach((c, i) => {
      if (scores[i]! > 0 && c.text.toLowerCase().includes(phrase)) scores[i] = scores[i]! * 1.5 + 3;
    });
  }
  const ranked = scores
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i);

  const matchLine = regex ? (s: string) => regex!.test(s) : (s: string) => tokenize(s).some((t) => qTokens.includes(t));
  const shown = ranked.slice(0, maxResults);
  const multi = files.length > 1;
  const lines: string[] = [];
  const head = `${fmtInt(ranked.length)} matching passage${ranked.length === 1 ? "" : "s"} for ${regex ? "/" + query + "/" : `"${query}"`} in ${scannedFiles} file${scannedFiles === 1 ? "" : "s"} (${fmtInt(chunks.length)} passages scanned)`;
  lines.push(head);
  if (ranked.length === 0) {
    lines.push("  No passages matched. Try fewer/different words, a synonym, or `regex: true` for an exact pattern.");
  }
  shown.forEach((r, n) => {
    const c = chunks[r.i]!;
    const first = c.ex.blocks[c.start]!.loc;
    const last = c.ex.blocks[c.end - 1]!.loc;
    const where = `${multi ? `${path.basename(c.ex.path)} · ` : ""}${spanLabel(first, last)}`;
    lines.push(`#${n + 1} ${where}  (score ${r.s.toFixed(1)})`);
    lines.push(...excerpt(c, matchLine, ctx));
  });
  if (ranked.length > shown.length) lines.push(`showing ${shown.length} of ${fmtInt(ranked.length)} — raise max_results (cap 30) or refine the query`);
  if (skipped.length) lines.push(`skipped: ${skipped.join("; ")}`);
  lines.push("next: read_section({ path, locator: { lines | pages | paras | slide | sheet+range } }) at a location above");
  const bounded = boundText(lines.join("\n"), 16_000, "lower max_results or context_lines");
  return { text: bounded.text, rawBytes };
}
