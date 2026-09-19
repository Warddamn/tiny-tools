import { toAbsolute } from "../paths.js";
import { extractDocx } from "./docx.js";
import { extractPdf } from "./pdf.js";
import { extractPptx } from "./pptx.js";
import { detectKind, extractPlain } from "./text.js";
import type { ExtractedText } from "./types.js";
import { extractXlsx } from "./xlsx.js";

export * from "./types.js";
export { detectKind, textToBlocks, decodeText, isProbablyBinary, CODE_EXTENSIONS, MARKDOWN_EXTENSIONS, MAX_TEXT_BYTES } from "./text.js";
export { colToIndex, indexToCol, splitRef, parseSheetXml } from "./xlsx.js";
export type { SheetMeta, ParsedSheet } from "./xlsx.js";
export type { OutlineItem } from "./pdf.js";
export { decodeXml, stripTags, attr as xmlAttr, readZipEntries, assertZip } from "./ooxml.js";

export const EXTRACTABLE = "txt · md · code · log · json · csv/tsv · pdf · docx · pptx · xlsx";

/**
 * Text + structure from any supported file, with location markers (line / page / sheet!cell / slide / ¶ + heading path).
 * Used by `context` (file_map, query_file, read_section, diff_files, extract) and `pdf`.
 */
export async function extractText(file: string): Promise<ExtractedText> {
  const abs = toAbsolute(file);
  const kind = detectKind(abs);
  switch (kind) {
    case "pdf":
      return extractPdf(abs);
    case "docx":
      return extractDocx(abs);
    case "pptx":
      return extractPptx(abs);
    case "xlsx":
      return extractXlsx(abs);
    default:
      return extractPlain(abs, kind);
  }
}
