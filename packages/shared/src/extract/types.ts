/** Where a block of text lives inside its document. Only the fields relevant to the format are set. */
export interface Location {
  /** 1-based line (text/code/markdown; within the page for pdf; within the slide for pptx). */
  line?: number;
  /** 1-based page (pdf). */
  page?: number;
  /** Sheet name (xlsx). */
  sheet?: string;
  /** 1-based row (xlsx). */
  row?: number;
  /** First cell reference of the row, e.g. "A5" (xlsx). */
  cell?: string;
  /** 1-based slide (pptx). */
  slide?: number;
  /** 1-based paragraph (docx). */
  para?: number;
  /** Heading path from the document root, e.g. ["Terms", "Termination"] (markdown/docx). */
  heading?: string[];
}

export type BlockKind = "text" | "heading" | "code" | "row" | "title";

export interface TextBlock {
  text: string;
  loc: Location;
  kind?: BlockKind;
  /** Heading level (1 = top). */
  level?: number;
  /** Per-cell values (xlsx rows only). */
  cells?: Array<{ ref: string; value: string }>;
}

export type DocKind = "text" | "markdown" | "code" | "log" | "json" | "csv" | "pdf" | "docx" | "pptx" | "xlsx";

export interface ExtractedText {
  /** Absolute path. */
  path: string;
  kind: DocKind;
  /** File size on disk. */
  bytes: number;
  /** Size of the extracted text — what an agent would have to read. Used as the ledger's "raw". */
  textBytes: number;
  blocks: TextBlock[];
  /** Format-specific facts (pages, sheets, slide titles, outline…). */
  meta: Record<string, unknown>;
}

/** "line 12" · "page 3, line 7" · "Sales!A5" · "slide 4" · "¶88 (Terms > Termination)" */
export function formatLocation(loc: Location, opts: { withHeading?: boolean } = {}): string {
  let s: string;
  if (loc.page !== undefined) s = `page ${loc.page}${loc.line !== undefined ? `, line ${loc.line}` : ""}`;
  else if (loc.sheet !== undefined) s = loc.cell ? `${loc.sheet}!${loc.cell}` : `${loc.sheet} row ${loc.row ?? "?"}`;
  else if (loc.slide !== undefined) s = `slide ${loc.slide}${loc.line !== undefined ? `, line ${loc.line}` : ""}`;
  else if (loc.para !== undefined) s = `¶${loc.para}`;
  else if (loc.line !== undefined) s = `line ${loc.line}`;
  else s = "?";
  if (opts.withHeading && loc.heading && loc.heading.length) s += ` (${loc.heading.join(" > ")})`;
  return s;
}

export function joinBlocks(blocks: TextBlock[]): string {
  return blocks.map((b) => b.text).join("\n");
}

export function wordCount(s: string): number {
  const m = s.match(/\S+/g);
  return m ? m.length : 0;
}
