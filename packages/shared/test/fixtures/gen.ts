/**
 * @author AVRG3
 * Generates the binary test fixtures (docx/pptx/xlsx via minimal OOXML, pdf via pdf-lib).
 * Run once: `npx tsx packages/shared/test/fixtures/gen.ts`. Outputs are committed.
 */
import { strToU8, zipSync } from "fflate";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

const here = path.dirname(fileURLToPath(import.meta.url));
const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function zip(files: Record<string, string>): Uint8Array {
  const o: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) o[k] = strToU8(v);
  return zipSync(o, { level: 6 });
}

const CT = (overrides: string[]) =>
  XMLH +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  overrides.join("") +
  `</Types>`;
const ov = (part: string, ct: string) => `<Override PartName="${part}" ContentType="${ct}"/>`;
const RELS = (rels: Array<[string, string, string]>) =>
  XMLH +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  rels.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join("") +
  `</Relationships>`;
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function docx(): Uint8Array {
  const p = (text: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const runs = `<w:p><w:r><w:t xml:space="preserve">Payment is due within </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>30 days</w:t></w:r><w:r><w:t xml:space="preserve"> of invoice.</w:t></w:r></w:p>`;
  const tab = `<w:p><w:r><w:t>Tab</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>here &amp; &lt;there&gt;</w:t></w:r></w:p>`;
  const tbl = `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid><w:tr><w:tc>${p("Item")}</w:tc><w:tc>${p("Price")}</w:tc></w:tr><w:tr><w:tc>${p("Widget")}</w:tc><w:tc>${p("$10")}</w:tc></w:tr></w:tbl>`;
  const body = [
    p("Service Agreement", "Title"),
    p("1. Introduction", "Heading1"),
    p("This agreement is made between Acme Corp and the Client."),
    p("1.1 Definitions", "Heading2"),
    p('"Services" means the consulting services described in Schedule A.'),
    p("2. Payment", "Heading1"),
    runs,
    tbl,
    p("3. Termination", "Heading1"),
    p("Either party may terminate this agreement with 30 days written notice."),
    p("Termination for cause requires a material breach that remains uncured for 14 days."),
    `<w:p/>`,
    tab,
  ].join("");
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
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Service Agreement</dc:title><dc:creator>tiny-tools</dc:creator></cp:coreProperties>`,
  });
}

function xlsx(): Uint8Array {
  const shared = ["region", "total", "date", "North", "South", "East", "West"];
  const s = (ref: string, idx: number) => `<c r="${ref}" t="s"><v>${idx}</v></c>`;
  const num = (ref: string, v: number) => `<c r="${ref}"><v>${v}</v></c>`;
  const inl = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${esc(text)}</t></is></c>`;
  const b = (ref: string, v: boolean) => `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
  const ws = (dim: string, rows: string) =>
    XMLH +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dim}"/><sheetData>${rows}</sheetData></worksheet>`;
  const sheet1 = ws(
    "A1:C7",
    `<row r="1">${s("A1", 0)}${s("B1", 1)}${s("C1", 2)}</row>` +
      `<row r="2">${s("A2", 3)}${num("B2", 1200.5)}${num("C2", 45658)}</row>` +
      `<row r="3">${s("A3", 4)}${num("B3", -40)}${num("C3", 45659)}</row>` +
      `<row r="4">${s("A4", 5)}${num("B4", 980)}${num("C4", 45660)}</row>` +
      `<row r="5">${s("A5", 6)}${num("B5", 310)}${num("C5", 45661)}</row>` +
      `<row r="6"/>` +
      `<row r="7">${s("A7", 3)}${num("B7", 15)}${b("C7", true)}</row>`,
  );
  const sheet2 = ws(
    "A1:B2",
    `<row r="1">${inl("A1", "note")}${inl("B1", "owner")}</row><row r="2">${inl("A2", "Pricing review needed")}${inl("B2", "Dana")}</row>`,
  );
  const sst =
    XMLH +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">` +
    shared.map((t) => `<si><t>${esc(t)}</t></si>`).join("") +
    `</sst>`;
  const styles =
    XMLH +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;
  const SML = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  return zip({
    "[Content_Types].xml": CT([
      ov("/xl/workbook.xml", `${SML}.sheet.main+xml`),
      ov("/xl/worksheets/sheet1.xml", `${SML}.worksheet+xml`),
      ov("/xl/worksheets/sheet2.xml", `${SML}.worksheet+xml`),
      ov("/xl/sharedStrings.xml", `${SML}.sharedStrings+xml`),
      ov("/xl/styles.xml", `${SML}.styles+xml`),
    ]),
    "_rels/.rels": RELS([["rId1", `${R}/officeDocument`, "xl/workbook.xml"]]),
    "xl/_rels/workbook.xml.rels": RELS([
      ["rId1", `${R}/worksheet`, "worksheets/sheet1.xml"],
      ["rId2", `${R}/worksheet`, "worksheets/sheet2.xml"],
      ["rId3", `${R}/sharedStrings`, "sharedStrings.xml"],
      ["rId4", `${R}/styles`, "styles.xml"],
    ]),
    "xl/workbook.xml":
      XMLH +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/worksheets/sheet1.xml": sheet1,
    "xl/worksheets/sheet2.xml": sheet2,
    "xl/sharedStrings.xml": sst,
    "xl/styles.xml": styles,
  });
}

function pptx(): Uint8Array {
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const sp = (id: number, name: string, ph: string | null, paras: string[]) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ""}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>` +
    paras.map((t) => `<a:p><a:r><a:rPr lang="en-US"/><a:t>${esc(t)}</a:t></a:r></a:p>`).join("") +
    `</p:txBody></p:sp>`;
  const tableFrame = (id: number, rows: string[][]) =>
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>` +
    rows.map((r) => `<a:tr>${r.map((c) => `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>${esc(c)}</a:t></a:r></a:p></a:txBody></a:tc>`).join("")}</a:tr>`).join("") +
    `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  const slide = (shapes: string) =>
    XMLH +
    `<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`;
  const slides = [
    slide(sp(2, "Title 1", "ctrTitle", ["Q3 Business Review"]) + sp(3, "Subtitle 2", "subTitle", ["Prepared by the PD team"])),
    slide(sp(2, "Title 1", "title", ["Pricing Update"]) + sp(3, "Content 2", "body", ["Base price rises 4% in October", "Volume discounts unchanged"])),
    slide(sp(2, "Title 1", "title", ["Next Steps"]) + tableFrame(4, [["Owner", "Task"], ["Dana", "Confirm pricing with sales"]])),
  ];
  const PML = "application/vnd.openxmlformats-officedocument.presentationml";
  const files: Record<string, string> = {
    "[Content_Types].xml": CT([
      ov("/ppt/presentation.xml", `${PML}.presentation.main+xml`),
      ...slides.map((_, i) => ov(`/ppt/slides/slide${i + 1}.xml`, `${PML}.slide+xml`)),
    ]),
    "_rels/.rels": RELS([["rId1", `${R}/officeDocument`, "ppt/presentation.xml"]]),
    "ppt/_rels/presentation.xml.rels": RELS(slides.map((_, i) => [`rId${i + 2}`, `${R}/slide`, `slides/slide${i + 1}.xml`] as [string, string, string])),
    "ppt/presentation.xml":
      XMLH +
      `<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldIdLst>` +
      slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("") +
      `</p:sldIdLst></p:presentation>`,
  };
  slides.forEach((s, i) => (files[`ppt/slides/slide${i + 1}.xml`] = s));
  return zip(files);
}

async function pdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle("Service Agreement");
  const pages = [
    ["Service Agreement", "1. Introduction", "This agreement is made between Acme Corp and the Client.", "Consulting services are described in Schedule A."],
    ["3. Termination", "Either party may terminate this agreement with 30 days written notice.", "Termination for cause requires a material breach."],
    ["Schedule A", "Consulting services: design operations and product development."],
  ];
  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    let y = 740;
    for (const line of lines) {
      page.drawText(line, { x: 72, y, size: 12, font });
      y -= 24;
    }
  }
  return doc.save();
}

async function main(): Promise<void> {
  await fs.writeFile(path.join(here, "sample.docx"), docx());
  await fs.writeFile(path.join(here, "sample.xlsx"), xlsx());
  await fs.writeFile(path.join(here, "sample.pptx"), pptx());
  await fs.writeFile(path.join(here, "sample.pdf"), await pdf());
  console.log("fixtures written to", here);
}
await main();
