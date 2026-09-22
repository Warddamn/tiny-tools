// @author AVRG3
import { promises as fs } from 'node:fs';
import { teach } from '../errors.js';
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
const cache = new Map<string, { identity: string; expires: number; bytes: number; value: ExtractedText }>();
let cachedBytes = 0;
const CACHE_BYTES = 16_000_000;
async function identity(file: string): Promise<string> {
  const s = await fs.stat(file, { bigint: true });
  return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
}
/** Bounded in-process reuse; metadata is checked on EVERY hit and mutable results never escape the cache. */
export async function extractText(file: string): Promise<ExtractedText> {
  const abs = toAbsolute(file), before = await identity(abs), now = Date.now();
  for(const [key, entry] of cache) if(entry.expires <= now) { cache.delete(key); cachedBytes -= entry.bytes; }
  const old = cache.get(abs);
  if(old && old.identity === before) { cache.delete(abs); cache.set(abs,old); return structuredClone(old.value); }
  if(old) { cache.delete(abs); cachedBytes -= old.bytes; }
  const value = await parseText(abs);
  if(before !== await identity(abs)) throw teach('File changed while it was being parsed.', 'Retry against a stable saved file.');
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if(bytes <= CACHE_BYTES) {
    const concurrent = cache.get(abs);
    if(concurrent) { cache.delete(abs); cachedBytes -= concurrent.bytes; }
    while(cache.size && (cache.size >= 8 || cachedBytes + bytes > CACHE_BYTES)) {
      const key = cache.keys().next().value!; cachedBytes -= cache.get(key)!.bytes; cache.delete(key);
    }
    cache.set(abs,{identity:before,expires:now+30_000,bytes,value:structuredClone(value)}); cachedBytes += bytes;
  }
  return value;
}
async function parseText(abs: string): Promise<ExtractedText> {
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
