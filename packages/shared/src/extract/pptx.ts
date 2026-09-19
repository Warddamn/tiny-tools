// @author AVRG3
import { promises as fs } from "node:fs";
import { teach } from "../errors.js";
import { assertZip, attr, decodeXml, readZipEntries, relsMap, resolveTarget } from "./ooxml.js";
import type { ExtractedText, TextBlock } from "./types.js";
import { wordCount } from "./types.js";

function paragraphsOf(xml: string): string[] {
  const out: string[] = [];
  const re = /<a:p(?:\s[^>]*?)?\/>|<a:p(?:\s[^>]*?)?>([\s\S]*?)<\/a:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] === undefined) continue;
    let text = "";
    const tre = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g;
    let t: RegExpExecArray | null;
    while ((t = tre.exec(m[1]!))) text += t[1] !== undefined ? decodeXml(t[1]) : "\n";
    if (text.trim()) out.push(text);
  }
  return out;
}

export async function extractPptx(file: string): Promise<ExtractedText> {
  const buf = await fs.readFile(file);
  assertZip(buf, file, "pptx");
  const entries = readZipEntries(
    buf,
    (n) => n === "ppt/presentation.xml" || n === "ppt/_rels/presentation.xml.rels" || /^ppt\/slides\/slide\d+\.xml$/.test(n),
  );
  const pres = entries.get("ppt/presentation.xml");
  if (!pres) throw teach(`${file} has no ppt/presentation.xml inside.`, "Is it really a .pptx? Legacy .ppt must be re-saved as .pptx.");

  // Slide order: sldIdLst r:id → rels → part name. Fallback: numeric order of slideN.xml.
  const rels = relsMap(entries.get("ppt/_rels/presentation.xml.rels"));
  const ordered: string[] = [];
  const idRe = /<p:sldId\s[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(pres))) {
    const rid = attr(m[0], "r:id");
    const target = rid ? rels.get(rid) : undefined;
    if (target) {
      const part = resolveTarget("ppt", target);
      if (entries.has(part)) ordered.push(part);
    }
  }
  if (ordered.length === 0) {
    ordered.push(
      ...[...entries.keys()]
        .filter((n) => n.startsWith("ppt/slides/"))
        .sort((a, b) => parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10) - parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10)),
    );
  }

  const blocks: TextBlock[] = [];
  const titles: string[] = [];
  let words = 0;
  ordered.forEach((part, idx) => {
    const slide = idx + 1;
    const xml = entries.get(part)!;
    let line = 0;
    let title = "";
    const shapeRe = /<p:(sp|graphicFrame)(?:\s[^>]*)?>([\s\S]*?)<\/p:\1>/g;
    let s: RegExpExecArray | null;
    while ((s = shapeRe.exec(xml))) {
      const shapeXml = s[2]!;
      const isTitle = /<p:ph\s[^>]*type="(?:title|ctrTitle)"/.test(shapeXml);
      for (const p of paragraphsOf(shapeXml)) {
        line++;
        words += wordCount(p);
        if (isTitle && !title) title = p.replace(/\s+/g, " ").trim();
        blocks.push({ text: p, loc: { slide, line }, kind: isTitle ? "title" : "text" });
      }
    }
    titles.push(title);
  });

  const textBytes = Buffer.byteLength(blocks.map((b) => b.text).join("\n"), "utf8");
  return {
    path: file,
    kind: "pptx",
    bytes: buf.length,
    textBytes,
    blocks,
    meta: { slides: ordered.length, titles, words },
  };
}
