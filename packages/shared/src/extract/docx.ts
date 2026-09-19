import { promises as fs } from "node:fs";
import { teach } from "../errors.js";
import { assertZip, attr, decodeXml, readZipEntries, stripTags } from "./ooxml.js";
import type { ExtractedText, TextBlock } from "./types.js";
import { wordCount } from "./types.js";

function headingLevel(pPr: string): number | null {
  const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(pPr)?.[1] ?? "";
  if (/^title$/i.test(style)) return 1;
  if (/^subtitle$/i.test(style)) return 2;
  const m = /^(?:heading|berschrift|titre|t[ií]tulo|kop|rubrik|overskrift)\s*(\d)$/i.exec(style);
  if (m) return parseInt(m[1]!, 10);
  const ol = /<w:outlineLvl\s+w:val="(\d)"/.exec(pPr);
  if (ol) return parseInt(ol[1]!, 10) + 1;
  return null;
}

/** Text of one <w:p> body: runs, tabs, breaks. */
export function paragraphText(inner: string): string {
  let out = "";
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\/>|<w:sym\s[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    const tok = m[0];
    if (tok.startsWith("<w:t") && m[1] !== undefined) out += decodeXml(m[1]);
    else if (tok.startsWith("<w:tab")) out += "\t";
    else if (tok.startsWith("<w:br") || tok.startsWith("<w:cr")) out += "\n";
  }
  return out;
}

export async function extractDocx(file: string): Promise<ExtractedText> {
  const buf = await fs.readFile(file);
  assertZip(buf, file, "docx");
  const entries = readZipEntries(buf, (n) => n === "word/document.xml" || n === "docProps/core.xml");
  const doc = entries.get("word/document.xml");
  if (!doc) throw teach(`${file} has no word/document.xml inside.`, "Is it really a .docx? Legacy .doc must be re-saved as .docx.");

  // Drop AlternateContent fallbacks (they duplicate text-box content).
  const body = doc.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "");
  const blocks: TextBlock[] = [];
  const stack: Array<{ level: number; text: string }> = [];
  const paraRe = /<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*?)?>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  let para = 0;
  let words = 0;
  while ((m = paraRe.exec(body))) {
    para++;
    if (m[1] === undefined) continue; // self-closing <w:p/> — empty paragraph
    const inner = m[1];
    const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(inner)?.[1] ?? "";
    const text = paragraphText(inner);
    const level = headingLevel(pPr);
    if (!text.trim()) continue;
    words += wordCount(text);
    if (level !== null) {
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      stack.push({ level, text: text.trim() });
      blocks.push({ text, loc: { para, heading: stack.map((s) => s.text) }, kind: "heading", level });
    } else {
      blocks.push({ text, loc: { para, heading: stack.map((s) => s.text) }, kind: "text" });
    }
  }

  const core = entries.get("docProps/core.xml");
  const title = core ? stripTags(/<dc:title>([\s\S]*?)<\/dc:title>/.exec(core)?.[1] ?? "") : "";
  const creator = core ? stripTags(/<dc:creator>([\s\S]*?)<\/dc:creator>/.exec(core)?.[1] ?? "") : "";
  const tables = (body.match(/<w:tbl>/g) ?? []).length;
  const textBytes = Buffer.byteLength(blocks.map((b) => b.text).join("\n"), "utf8");
  return {
    path: file,
    kind: "docx",
    bytes: buf.length,
    textBytes,
    blocks,
    meta: {
      paragraphs: para,
      nonEmptyParagraphs: blocks.length,
      headings: blocks.filter((b) => b.kind === "heading").length,
      tables,
      words,
      ...(title ? { title } : {}),
      ...(creator ? { creator } : {}),
    },
  };
}

// re-exported for tests
export { attr as _attr };
