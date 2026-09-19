// @author AVRG3
/** Minimal DOCX/PPTX builders for benchmark fixtures (no dependency beyond fflate). */
import { strToU8, zipSync } from "fflate";

const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function zip(files: Record<string, string>): Uint8Array {
  const o: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) o[k] = strToU8(v);
  return zipSync(o, { level: 6 });
}

const CT = (overrides: string[]): string =>
  XMLH +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  overrides.join("") +
  `</Types>`;
const ov = (part: string, ct: string): string => `<Override PartName="${part}" ContentType="${ct}"/>`;
const RELS = (rels: Array<[string, string, string]>): string =>
  XMLH +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  rels.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join("") +
  `</Relationships>`;

export interface DocxPara {
  text: string;
  /** "Title" | "Heading1" | "Heading2" | undefined */
  style?: string;
}

export function buildDocx(paras: DocxPara[], title = "Document"): Uint8Array {
  const p = (t: string, style?: string): string =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  const body = paras.map((x) => p(x.text, x.style)).join("");
  const styles =
    XMLH +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="56"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>` +
    `</w:styles>`;
  return zip({
    "[Content_Types].xml": CT([
      ov("/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"),
      ov("/word/styles.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"),
      ov("/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"),
    ]),
    "_rels/.rels": RELS([
      ["rId1", `${R}/officeDocument`, "word/document.xml"],
      ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"],
    ]),
    "word/_rels/document.xml.rels": RELS([["rId1", `${R}/styles`, "styles.xml"]]),
    "word/styles.xml": styles,
    "word/document.xml":
      XMLH +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`,
    "docProps/core.xml":
      XMLH +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title><dc:creator>tiny-tools bench</dc:creator></cp:coreProperties>`,
  });
}

export interface Slide {
  title: string;
  bullets: string[];
}

export function buildPptx(slides: Slide[]): Uint8Array {
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const sp = (id: number, name: string, ph: string, paras: string[]): string =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr><p:ph type="${ph}"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>` +
    paras.map((t) => `<a:p><a:r><a:rPr lang="en-US"/><a:t>${esc(t)}</a:t></a:r></a:p>`).join("") +
    `</p:txBody></p:sp>`;
  const slideXml = (s: Slide, i: number): string =>
    XMLH +
    `<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
    sp(2, "Title 1", i === 0 ? "ctrTitle" : "title", [s.title]) +
    (s.bullets.length ? sp(3, "Content 2", "body", s.bullets) : "") +
    `</p:spTree></p:cSld></p:sld>`;
  const PML = "application/vnd.openxmlformats-officedocument.presentationml";
  const files: Record<string, string> = {
    "[Content_Types].xml": CT([ov("/ppt/presentation.xml", `${PML}.presentation.main+xml`), ...slides.map((_, i) => ov(`/ppt/slides/slide${i + 1}.xml`, `${PML}.slide+xml`))]),
    "_rels/.rels": RELS([["rId1", `${R}/officeDocument`, "ppt/presentation.xml"]]),
    "ppt/_rels/presentation.xml.rels": RELS(slides.map((_, i) => [`rId${i + 2}`, `${R}/slide`, `slides/slide${i + 1}.xml`] as [string, string, string])),
    "ppt/presentation.xml":
      XMLH +
      `<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldIdLst>` +
      slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("") +
      `</p:sldIdLst></p:presentation>`,
  };
  slides.forEach((s, i) => (files[`ppt/slides/slide${i + 1}.xml`] = slideXml(s, i)));
  return zip(files);
}
