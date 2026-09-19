// @author AVRG3
import { describe, expect, it } from "vitest";
import { TeachError, colToIndex, extractText, formatLocation, indexToCol } from "../src/index.js";
import type { SheetMeta } from "../src/index.js";
import { fx } from "./helpers.js";

describe("extractText", () => {
  it("markdown: heading blocks, heading paths, fence-aware, setext", async () => {
    const ex = await extractText(fx("sample.md"));
    expect(ex.kind).toBe("markdown");
    const headings = ex.blocks.filter((b) => b.kind === "heading").map((b) => b.text);
    expect(headings).toEqual(["# Contract", "## Parties", "## Termination", "Setext Heading"]);
    const body = ex.blocks.find((b) => b.text.includes("thirty days"))!;
    expect(body.loc).toEqual({ line: 11, heading: ["Contract", "Termination"] });
    const fenced = ex.blocks.find((b) => b.text === "# not a heading")!;
    expect(fenced.kind).toBe("code");
    expect(ex.meta["headings"]).toBe(4);
    expect(ex.textBytes).toBe(ex.bytes);
  });

  it("code: one block per line, kind code", async () => {
    const ex = await extractText(fx("sample.ts"));
    expect(ex.kind).toBe("code");
    expect(ex.blocks[0]).toEqual({ text: 'import { readFile } from "node:fs/promises";', loc: { line: 1 }, kind: "code" });
    expect(ex.blocks.length).toBe(31);
  });

  it("docx: paragraphs with heading paths, runs joined, tables, tabs, entities, core props", async () => {
    const ex = await extractText(fx("sample.docx"));
    expect(ex.kind).toBe("docx");
    expect(ex.meta["headings"]).toBe(5);
    expect(ex.meta["tables"]).toBe(1);
    expect(ex.meta["title"]).toBe("Service Agreement");
    const texts = ex.blocks.map((b) => b.text);
    expect(texts).toContain("Payment is due within 30 days of invoice.");
    expect(texts).toContain("Widget");
    expect(texts).toContain("Tab\there & <there>");
    const term = ex.blocks.find((b) => b.text.startsWith("Either party may terminate"))!;
    expect(term.loc.heading).toEqual(["3. Termination"]);
    expect(term.loc.para).toBeGreaterThan(0);
    const defs = ex.blocks.find((b) => b.text.startsWith('"Services"'))!;
    expect(defs.loc.heading).toEqual(["1. Introduction", "1.1 Definitions"]);
    expect(ex.blocks.find((b) => b.kind === "heading" && b.level === 2)!.text).toBe("1.1 Definitions");
  });

  it("pptx: slide order, titles, body paragraphs, table cells", async () => {
    const ex = await extractText(fx("sample.pptx"));
    expect(ex.kind).toBe("pptx");
    expect(ex.meta["slides"]).toBe(3);
    expect(ex.meta["titles"]).toEqual(["Q3 Business Review", "Pricing Update", "Next Steps"]);
    const body = ex.blocks.find((b) => b.text === "Base price rises 4% in October")!;
    expect(body.loc).toEqual({ slide: 2, line: 2 });
    expect(ex.blocks.some((b) => b.loc.slide === 3 && b.text === "Confirm pricing with sales")).toBe(true);
    expect(ex.blocks.filter((b) => b.kind === "title").length).toBe(3);
  });

  it("xlsx: sheets, headers, shared/inline/boolean cells, row gaps, cell refs", async () => {
    const ex = await extractText(fx("sample.xlsx"));
    expect(ex.kind).toBe("xlsx");
    const sheets = ex.meta["sheets"] as SheetMeta[];
    expect(sheets.map((s) => s.name)).toEqual(["Sales", "Notes"]);
    expect(sheets[0]).toMatchObject({ rows: 6, cols: 3, headers: ["region", "total", "date"], dimension: "A1:C7" });
    const row3 = ex.blocks.find((b) => b.loc.sheet === "Sales" && b.loc.row === 3)!;
    expect(row3.text).toBe("South | -40 | 45659");
    expect(row3.cells).toEqual([
      { ref: "A3", value: "South" },
      { ref: "B3", value: "-40" },
      { ref: "C3", value: "45659" },
    ]);
    expect(formatLocation(row3.loc)).toBe("Sales!A3");
    const row7 = ex.blocks.find((b) => b.loc.sheet === "Sales" && b.loc.row === 7)!;
    expect(row7.text).toBe("North | 15 | TRUE");
    expect(ex.blocks.some((b) => b.loc.sheet === "Notes" && b.text === "Pricing review needed | Dana")).toBe(true);
    expect(colToIndex("AB")).toBe(28);
    expect(indexToCol(28)).toBe("AB");
  });

  it("pdf: pages, per-page lines, metadata", async () => {
    const ex = await extractText(fx("sample.pdf"));
    expect(ex.kind).toBe("pdf");
    expect(ex.meta["pages"]).toBe(3);
    expect(ex.meta["scanned"]).toBe(false);
    const term = ex.blocks.find((b) => b.text.includes("Termination"))!;
    expect(term.loc.page).toBe(2);
    expect(formatLocation(term.loc)).toMatch(/^page 2, line \d+$/);
    expect((ex.meta["info"] as Record<string, unknown>)["Title"]).toBe("Service Agreement");
    expect(ex.textBytes).toBeGreaterThan(100);
  });

  it("teach-errors: fake docx, binary file, not-a-pdf, missing file", async () => {
    await expect(extractText(fx("fake.docx"))).rejects.toThrow(/not a valid \.docx \(not a zip container\)/);
    await expect(extractText(fx("binary.bin"))).rejects.toThrow(/looks like a binary file/);
    await expect(extractText(fx("notpdf.pdf"))).rejects.toThrow(/not a PDF/);
    const err = await extractText(fx("fake.docx")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeachError);
  });

  it("formatLocation covers every shape", () => {
    expect(formatLocation({ line: 12 })).toBe("line 12");
    expect(formatLocation({ line: 12, heading: ["Install", "macOS"] }, { withHeading: true })).toBe("line 12 (Install > macOS)");
    expect(formatLocation({ page: 3, line: 7 })).toBe("page 3, line 7");
    expect(formatLocation({ sheet: "Sales", row: 5 })).toBe("Sales row 5");
    expect(formatLocation({ slide: 4 })).toBe("slide 4");
    expect(formatLocation({ para: 88, heading: ["Terms", "Termination"] }, { withHeading: true })).toBe("¶88 (Terms > Termination)");
  });
});
