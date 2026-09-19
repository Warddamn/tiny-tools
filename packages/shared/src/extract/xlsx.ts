import { promises as fs } from "node:fs";
import { teach } from "../errors.js";
import { assertZip, attr, decodeXml, readZipEntries, relsMap, resolveTarget, stripTags } from "./ooxml.js";
import type { ExtractedText, TextBlock } from "./types.js";

export interface SheetMeta {
  name: string;
  rows: number;
  cols: number;
  headers: string[];
  dimension?: string;
}

/** "AB" → 28 (1-based). */
export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** 28 → "AB". */
export function indexToCol(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function splitRef(ref: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref);
  return m ? { col: m[1]!.toUpperCase(), row: parseInt(m[2]!, 10) } : { col: "A", row: 0 };
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    let s = "";
    const tre = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tre.exec(m[1]!))) s += decodeXml(t[1]!);
    out.push(s);
  }
  return out;
}

export interface ParsedSheet {
  name: string;
  rows: Array<{ row: number; cells: Array<{ ref: string; value: string }> }>;
  dimension?: string;
}

export function parseSheetXml(name: string, xml: string, shared: string[]): ParsedSheet {
  const dimension = attr(/<dimension\s[^>]*>/.exec(xml)?.[0] ?? "", "ref");
  const rows: ParsedSheet["rows"] = [];
  const rowRe = /<row(?:\s([^>]*?))?\s*(?:\/>|>([\s\S]*?)<\/row>)/g;
  let m: RegExpExecArray | null;
  let counter = 0;
  while ((m = rowRe.exec(xml))) {
    if (m[2] === undefined) continue; // self-closing <row/> — empty row
    counter++;
    const rowNo = parseInt(attr(`<row ${m[1] ?? ""}>`, "r") ?? String(counter), 10) || counter;
    const cells: Array<{ ref: string; value: string }> = [];
    const cellRe = /<c(?:\s([^>]*?))?(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(m[2]!))) {
      const tag = `<c ${c[1] ?? ""}>`;
      const ref = attr(tag, "r") ?? "";
      const type = attr(tag, "t") ?? "";
      const inner = c[2] ?? "";
      let value = "";
      if (type === "s") {
        const idx = parseInt(stripTags(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ""), 10);
        value = shared[idx] ?? "";
      } else if (type === "inlineStr") {
        value = stripTags(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "");
      } else if (type === "b") {
        value = (/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "") === "1" ? "TRUE" : "FALSE";
      } else {
        value = stripTags(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }
      if (value !== "") cells.push({ ref, value });
    }
    if (cells.length) rows.push({ row: rowNo, cells });
  }
  return { name, rows, ...(dimension ? { dimension } : {}) };
}

export async function extractXlsx(file: string): Promise<ExtractedText> {
  const buf = await fs.readFile(file);
  assertZip(buf, file, "xlsx");
  const entries = readZipEntries(
    buf,
    (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(n),
  );
  const wb = entries.get("xl/workbook.xml");
  if (!wb) throw teach(`${file} has no xl/workbook.xml inside.`, "Is it really a .xlsx? Legacy .xls must be re-saved as .xlsx.");
  const rels = relsMap(entries.get("xl/_rels/workbook.xml.rels"));
  const shared = parseSharedStrings(entries.get("xl/sharedStrings.xml"));

  const sheets: Array<{ name: string; part: string }> = [];
  const sheetRe = /<sheet\s[^>]*>/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = sheetRe.exec(wb))) {
    n++;
    const name = attr(m[0], "name") ?? `Sheet${n}`;
    const rid = attr(m[0], "r:id");
    const target = rid ? rels.get(rid) : undefined;
    const part = target ? resolveTarget("xl", target) : `xl/worksheets/sheet${n}.xml`;
    if (entries.has(part)) sheets.push({ name, part });
  }

  const blocks: TextBlock[] = [];
  const sheetMeta: SheetMeta[] = [];
  for (const s of sheets) {
    const parsed = parseSheetXml(s.name, entries.get(s.part)!, shared);
    let maxCol = 0;
    let headers: string[] = [];
    for (const r of parsed.rows) {
      for (const c of r.cells) maxCol = Math.max(maxCol, colToIndex(splitRef(c.ref).col));
      if (headers.length === 0) headers = r.cells.map((c) => c.value);
      blocks.push({
        text: r.cells.map((c) => c.value).join(" | "),
        loc: { sheet: s.name, row: r.row, cell: r.cells[0]?.ref },
        kind: "row",
        cells: r.cells,
      });
    }
    sheetMeta.push({ name: s.name, rows: parsed.rows.length, cols: maxCol, headers, ...(parsed.dimension ? { dimension: parsed.dimension } : {}) });
  }
  const textBytes = Buffer.byteLength(blocks.map((b) => b.text).join("\n"), "utf8");
  return { path: file, kind: "xlsx", bytes: buf.length, textBytes, blocks, meta: { sheets: sheetMeta } };
}
