// @author AVRG3
import * as path from "node:path";
import {
  type ExtractedText,
  type SheetMeta,
  type TextBlock,
  colToIndex,
  extractText,
  fmtInt,
  indexToCol,
  resolveInputs,
  splitRef,
  teach,
  truncateLine,
  wordCount,
} from "@tinytools/shared";
import type { ReadSectionArgs } from "../schemas.js";
import { type LibResult, describeRange, parseRange } from "./result.js";

const LINE_KINDS = new Set(["text", "markdown", "code", "log", "json", "csv"]);

function validLocators(ex: ExtractedText): string {
  switch (ex.kind) {
    case "pdf":
      return `For a PDF use { pages: "3-5" } (${ex.meta["pages"]} pages). file_map shows the first line of each page.`;
    case "docx":
      return `For a DOCX use { heading: "…" } or { paras: "88-95" } (${ex.meta["nonEmptyParagraphs"]} paragraphs). file_map lists headings with ¶ numbers.`;
    case "pptx":
      return `For a PPTX use { slide: 4 } or { slide: "2-5" } (${ex.meta["slides"]} slides). file_map lists slide titles.`;
    case "xlsx": {
      const names = ((ex.meta["sheets"] as SheetMeta[]) ?? []).map((s) => s.name).join(", ");
      return `For an XLSX use { sheet: "<name>", range: "A1:F20" } or { sheet, range: "10-40" }. Sheets: ${names}.`;
    }
    case "markdown":
      return `Use { heading: "…" } or { lines: "120-180" } (${ex.blocks.length} lines). file_map lists headings with line numbers.`;
    default:
      return `Use { lines: "120-180" } (${ex.blocks.length} lines).`;
  }
}

function stripHeading(t: string): string {
  return t.replace(/^#+\s*/, "").replace(/\s*#+\s*$/, "").trim();
}

interface Selection {
  blocks: TextBlock[];
  label: string;
  /** Locator to continue with after truncation (given the last block that was shown). */
  next: (last: TextBlock) => string;
  notes: string[];
}

function selectHeading(ex: ExtractedText, heading: string): Selection {
  if (ex.kind !== "markdown" && ex.kind !== "docx") throw teach(`{ heading } only works for markdown and DOCX; this is ${ex.kind}.`, validLocators(ex));
  const needle = heading.toLowerCase().trim();
  const heads = ex.blocks.filter((b) => b.kind === "heading");
  const matches = heads.filter((h) => stripHeading(h.text).toLowerCase().includes(needle));
  if (matches.length === 0) {
    const list = heads.slice(0, 25).map((h) => `"${truncateLine(stripHeading(h.text), 60)}"`).join(", ");
    throw teach(`No heading matches "${heading}".`, heads.length ? `Available headings: ${list}${heads.length > 25 ? ", …" : ""}. Match is a case-insensitive substring.` : "The file has no headings — use { lines } or { paras } instead.");
  }
  const h = matches[0]!;
  const startIdx = ex.blocks.indexOf(h);
  let endIdx = ex.blocks.length;
  for (let i = startIdx + 1; i < ex.blocks.length; i++) {
    const b = ex.blocks[i]!;
    if (b.kind === "heading" && (b.level ?? 1) <= (h.level ?? 1)) {
      endIdx = i;
      break;
    }
  }
  const notes: string[] = [];
  if (matches.length > 1) {
    notes.push(`also matches: ${matches.slice(1, 6).map((m) => `"${truncateLine(stripHeading(m.text), 40)}" (${m.loc.line !== undefined ? `line ${m.loc.line}` : `¶${m.loc.para}`})`).join(", ")} — use { lines } / { paras } to pick another`);
  }
  const key = ex.kind === "docx" ? "paras" : "lines";
  return {
    blocks: ex.blocks.slice(startIdx, endIdx),
    label: `section "${stripHeading(h.text)}" (${key === "lines" ? `lines ${h.loc.line}–${ex.blocks[endIdx - 1]!.loc.line}` : `¶${h.loc.para}–${ex.blocks[endIdx - 1]!.loc.para}`})`,
    next: (last) => `{ ${key}: "${(key === "lines" ? last.loc.line! : last.loc.para!) + 1}-${key === "lines" ? ex.blocks[endIdx - 1]!.loc.line : ex.blocks[endIdx - 1]!.loc.para}" }`,
    notes,
  };
}

function selectPages(ex: ExtractedText, spec: string): Selection {
  if (ex.kind !== "pdf") throw teach(`{ pages } only works for PDFs; this is ${ex.kind}.`, validLocators(ex));
  const pages = parseRange(spec, 2000);
  if (!pages) throw teach(`Bad page range "${spec}".`, 'Use "3-5", "7" or "1,4,9".');
  const total = Number(ex.meta["pages"] ?? 0);
  const valid = pages.filter((p) => p <= total);
  if (valid.length === 0) throw teach(`Pages ${describeRange(pages)} are out of range — the PDF has ${total} pages.`, "Pick pages between 1 and " + total + ".");
  const set = new Set(valid);
  const blocks = ex.blocks.filter((b) => set.has(b.loc.page!));
  const notes: string[] = [];
  if (valid.length < pages.length) notes.push(`ignored pages beyond ${total}`);
  if (blocks.length === 0) notes.push("selected pages have no text layer (scanned?)");
  return {
    blocks,
    label: `page${valid.length > 1 ? "s" : ""} ${describeRange(valid)} of ${total}`,
    next: (last) => `{ pages: "${last.loc.page}-${valid[valid.length - 1]}" }`,
    notes,
  };
}

function selectLines(ex: ExtractedText, spec: string): Selection {
  if (!LINE_KINDS.has(ex.kind)) throw teach(`{ lines } only works for plain-text formats; this is ${ex.kind}.`, validLocators(ex));
  const m = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(spec) ?? (/^\s*(\d+)\s*$/.test(spec) ? [spec, spec.trim(), spec.trim()] : null);
  if (!m) throw teach(`Bad line range "${spec}".`, 'Use "120-180" or a single line number.');
  const a = parseInt(m[1]!, 10);
  const b = parseInt(m[2]!, 10);
  if (a < 1 || b < a) throw teach(`Bad line range "${spec}".`, "Start must be ≥ 1 and end ≥ start.");
  const total = ex.blocks.length;
  if (a > total) throw teach(`Line ${a} is past the end — the file has ${total} lines.`, `Pick lines between 1 and ${total}.`);
  const blocks = ex.blocks.slice(a - 1, Math.min(b, total));
  return {
    blocks,
    label: `lines ${a}–${Math.min(b, total)} of ${fmtInt(total)}`,
    next: (last) => `{ lines: "${last.loc.line! + 1}-${Math.min(b, total)}" }`,
    notes: b > total ? [`file ends at line ${total}`] : [],
  };
}

function selectParas(ex: ExtractedText, spec: string): Selection {
  if (ex.kind !== "docx") throw teach(`{ paras } only works for DOCX; this is ${ex.kind}.`, validLocators(ex));
  const paras = parseRange(spec, 5000);
  if (!paras) throw teach(`Bad paragraph range "${spec}".`, 'Use "88-95" or "12".');
  const set = new Set(paras);
  const blocks = ex.blocks.filter((b) => set.has(b.loc.para!));
  if (blocks.length === 0) throw teach(`No paragraphs ${describeRange(paras)} — the document has ¶1–¶${ex.meta["paragraphs"]} (empty ones are skipped).`, "Use file_map to see ¶ numbers of headings.");
  return { blocks, label: `¶${describeRange(paras)}`, next: (last) => `{ paras: "${last.loc.para! + 1}-${paras[paras.length - 1]}" }`, notes: [] };
}

function selectSlides(ex: ExtractedText, spec: string | number): Selection {
  if (ex.kind !== "pptx") throw teach(`{ slide } only works for PPTX; this is ${ex.kind}.`, validLocators(ex));
  const slides = parseRange(spec, 500);
  if (!slides) throw teach(`Bad slide "${spec}".`, 'Use 4 or "2-5".');
  const total = Number(ex.meta["slides"] ?? 0);
  const valid = slides.filter((s) => s <= total);
  if (valid.length === 0) throw teach(`Slide ${describeRange(slides)} is out of range — the deck has ${total} slides.`, `Pick 1–${total}.`);
  const set = new Set(valid);
  return {
    blocks: ex.blocks.filter((b) => set.has(b.loc.slide!)),
    label: `slide${valid.length > 1 ? "s" : ""} ${describeRange(valid)} of ${total}`,
    next: (last) => `{ slide: "${last.loc.slide! + 1}-${valid[valid.length - 1]}" }`,
    notes: [],
  };
}

interface CellWindow {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

function parseCellRange(range: string | undefined, sheetMeta: SheetMeta): CellWindow {
  const maxRow = 1_000_000;
  if (!range) return { rowStart: 1, rowEnd: maxRow, colStart: 1, colEnd: Math.max(sheetMeta.cols, 1) };
  let m = /^\s*([A-Za-z]+)(\d+)\s*:\s*([A-Za-z]+)(\d+)\s*$/.exec(range);
  if (m) return { colStart: colToIndex(m[1]!), rowStart: parseInt(m[2]!, 10), colEnd: colToIndex(m[3]!), rowEnd: parseInt(m[4]!, 10) };
  m = /^\s*([A-Za-z]+)\s*:\s*([A-Za-z]+)\s*$/.exec(range);
  if (m) return { colStart: colToIndex(m[1]!), colEnd: colToIndex(m[2]!), rowStart: 1, rowEnd: maxRow };
  m = /^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/.exec(range);
  if (m) return { rowStart: parseInt(m[1]!, 10), rowEnd: parseInt(m[2]!, 10), colStart: 1, colEnd: Math.max(sheetMeta.cols, 1) };
  m = /^\s*([A-Za-z]+)(\d+)\s*$/.exec(range);
  if (m) return { colStart: colToIndex(m[1]!), colEnd: colToIndex(m[1]!), rowStart: parseInt(m[2]!, 10), rowEnd: parseInt(m[2]!, 10) };
  throw teach(`Bad range "${range}".`, 'Use "A1:F20", "10-40" (rows), "B:D" (columns) or "C7" (one cell).');
}

function selectSheet(ex: ExtractedText, sheet: string, range: string | undefined): { sel: Selection; win: CellWindow } {
  if (ex.kind !== "xlsx") throw teach(`{ sheet } only works for XLSX; this is ${ex.kind}.`, validLocators(ex));
  const sheets = (ex.meta["sheets"] as SheetMeta[]) ?? [];
  const meta = sheets.find((s) => s.name === sheet) ?? sheets.find((s) => s.name.toLowerCase() === sheet.toLowerCase());
  if (!meta) throw teach(`No sheet named "${sheet}".`, `Sheets: ${sheets.map((s) => s.name).join(", ")}.`);
  const win = parseCellRange(range, meta);
  const blocks = ex.blocks.filter((b) => b.loc.sheet === meta.name && b.loc.row! >= win.rowStart && b.loc.row! <= win.rowEnd);
  const lastRow = blocks.length ? blocks[blocks.length - 1]!.loc.row! : win.rowStart;
  const colLabel = win.colEnd - win.colStart + 1 < meta.cols ? ` cols ${indexToCol(win.colStart)}–${indexToCol(win.colEnd)}` : "";
  return {
    sel: {
      blocks,
      label: `${meta.name}${range ? ` ${range.trim()}` : ""} (${blocks.length} of ${meta.rows} rows${colLabel})`,
      next: (last) => `{ sheet: "${meta.name}", range: "${indexToCol(win.colStart)}${last.loc.row! + 1}:${indexToCol(win.colEnd)}${Math.min(win.rowEnd, lastRow)}" }`,
      notes: blocks.length === 0 ? ["no non-empty rows in that range"] : [],
    },
    win,
  };
}

function renderXlsx(blocks: TextBlock[], win: CellWindow): string[] {
  const cols: number[] = [];
  for (let c = win.colStart; c <= win.colEnd; c++) cols.push(c);
  const out = [`| row | ${cols.map(indexToCol).join(" | ")} |`, `|---|${cols.map(() => "---").join("|")}|`];
  for (const b of blocks) {
    const byCol = new Map<number, string>();
    for (const cell of b.cells ?? []) byCol.set(colToIndex(splitRef(cell.ref).col), cell.value);
    out.push(`| ${b.loc.row} | ${cols.map((c) => (byCol.get(c) ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`);
  }
  return out;
}

export async function readSection(args: ReadSectionArgs): Promise<LibResult> {
  const [file] = await resolveInputs(args.path);
  const ex = await extractText(file!);
  const loc = args.locator ?? {};
  const maxTokens = args.max_tokens ?? 2000;
  const maxBytes = maxTokens * 4;

  let sel: Selection;
  let win: CellWindow | null = null;
  if (loc.heading) sel = selectHeading(ex, loc.heading);
  else if (loc.pages) sel = selectPages(ex, loc.pages);
  else if (loc.lines) sel = selectLines(ex, loc.lines);
  else if (loc.paras) sel = selectParas(ex, loc.paras);
  else if (loc.sheet) {
    const r = selectSheet(ex, loc.sheet, loc.range);
    sel = r.sel;
    win = r.win;
  } else if (loc.slide !== undefined && loc.slide !== "") sel = selectSlides(ex, loc.slide);
  else if (loc.range) throw teach("{ range } needs { sheet } too.", validLocators(ex));
  else throw teach("No locator given.", validLocators(ex));

  // Render
  const rendered: string[] = [];
  const blocks = sel.blocks;
  if (ex.kind === "xlsx" && win) rendered.push(...renderXlsx(blocks, win));
  else if (ex.kind === "pdf") {
    let page = -1;
    for (const b of blocks) {
      if (b.loc.page !== page) {
        page = b.loc.page!;
        rendered.push(`--- page ${page} ---`);
      }
      rendered.push(b.text);
    }
  } else if (ex.kind === "pptx") {
    let slide = -1;
    const titles = (ex.meta["titles"] as string[]) ?? [];
    for (const b of blocks) {
      if (b.loc.slide !== slide) {
        slide = b.loc.slide!;
        rendered.push(`--- slide ${slide}${titles[slide - 1] ? `: ${titles[slide - 1]}` : ""} ---`);
      }
      if (b.kind !== "title") rendered.push(b.text);
    }
  } else if (ex.kind === "docx") {
    for (const b of blocks) rendered.push(`¶${b.loc.para} ${b.text}`);
  } else {
    const width = String(blocks[blocks.length - 1]?.loc.line ?? 1).length;
    for (const b of blocks) rendered.push(`${String(b.loc.line).padStart(width)}| ${b.text}`);
  }

  // Bound by max_tokens, cutting at whole lines; work out the continuation locator.
  let used = 0;
  let shownLines = 0;
  for (const line of rendered) {
    const n = Buffer.byteLength(line, "utf8") + 1;
    if (used + n > maxBytes) break;
    used += n;
    shownLines++;
  }
  const truncated = shownLines < rendered.length;
  const body = rendered.slice(0, shownLines);
  // Map shown lines back to the last shown block (render prefixes are per block except separators/table header).
  let lastBlock: TextBlock | undefined;
  if (truncated) {
    const nonSep = body.filter((l) => !/^--- (page|slide) \d+/.test(l) && !/^\| row \|/.test(l) && !/^\|---/.test(l)).length;
    lastBlock = blocks[Math.max(0, nonSep - 1)];
  }
  const words = blocks.reduce((n, b) => n + wordCount(b.text), 0);
  const head = `${path.basename(ex.path)} · ${sel.label} · ${fmtInt(words)} words`;
  const tail: string[] = [...sel.notes];
  if (truncated && lastBlock) tail.push(`truncated at ~${fmtInt(maxTokens)} tokens (${shownLines} of ${rendered.length} lines) — continue with read_section({ locator: ${sel.next(lastBlock)} }) or raise max_tokens (cap 8000)`);
  const text = [head, ...body, ...tail].join("\n");
  return { text, rawBytes: ex.textBytes };
}
