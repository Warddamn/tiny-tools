import { describe, expect, it } from "vitest";
import { TeachError } from "@tinytools/shared";
import { evalJqSubset, extract, fileMap, queryFile, readSection } from "../src/index.js";
import { FIX, fx } from "./helpers.js";

describe("file_map", () => {
  it("directory: size-annotated tree with counts and types", async () => {
    const r = await fileMap({ path: FIX, depth: 1 });
    expect(r.text).toMatch(/fixtures\/ {2}— \d+ files, [\d.]+ KB \(depth 1\)/);
    expect(r.text).toContain("sample.pdf");
    expect(r.text).toMatch(/types: .*\.md \d/);
    expect(r.rawBytes).toBeGreaterThan(0);
  });

  it("code: signatures with line numbers and imports", async () => {
    const r = await fileMap({ path: fx("sample.ts") });
    expect(r.text).toContain("sample.ts — TypeScript/JavaScript · 31 lines");
    expect(r.text).toMatch(/L8 {5}export function parseConfig\(raw: string\): Config/);
    expect(r.text).toMatch(/L17 {4}export class Server/);
    expect(r.text).toMatch(/L20 {4} {2}start\(\): void/);
    expect(r.text).toMatch(/L29 {4}const helper = \(x: number\): number/);
    expect(r.text).toContain("imports: node:fs/promises");
    expect(r.text).not.toContain("console.log");
  });

  it("markdown: heading tree with lines and word counts", async () => {
    const r = await fileMap({ path: fx("sample.md") });
    expect(r.text).toMatch(/# Contract {2}\(line 1, \d+ words\)/);
    expect(r.text).toMatch(/ {2}## Termination {2}\(line 9, \d+ words\)/);
    expect(r.text).not.toContain("thirty days");
  });

  it("docx / pptx / xlsx / pdf / csv / json / log", async () => {
    const docx = await fileMap({ path: fx("sample.docx") });
    expect(docx.text).toMatch(/sample\.docx — docx · \d+ paragraphs · \d+ words · 1 tables/);
    expect(docx.text).toMatch(/# 3\. Termination {2}\(¶\d+, \d+ words\)/);
    expect(docx.text).toMatch(/ {2}## 1\.1 Definitions/);
    const pptx = await fileMap({ path: fx("sample.pptx") });
    expect(pptx.text).toContain("pptx · 3 slides");
    expect(pptx.text).toMatch(/ {2}2\. Pricing Update {2}\(3 text lines\)/);
    const xlsx = await fileMap({ path: fx("sample.xlsx") });
    expect(xlsx.text).toContain("Sales: 6 rows × 3 cols (A1:C7) — headers: region, total, date");
    expect(xlsx.text).toContain("Notes: 2 rows × 2 cols");
    const pdf = await fileMap({ path: fx("sample.pdf") });
    expect(pdf.text).toContain("pdf · 3 pages");
    expect(pdf.text).toMatch(/p2: 3\. Termination/);
    const csv = await fileMap({ path: fx("sample.csv") });
    expect(csv.text).toContain("csv · 6 data rows × 4 cols");
    expect(csv.text).toContain("columns: region, total, date, note");
    const json = await fileMap({ path: fx("sample.json") });
    expect(json.text).toContain("items: array[2]");
    expect(json.text).toContain("owner: string");
    const log = await fileMap({ path: fx("sample.log") });
    expect(log.text).toMatch(/log · 60 lines/);
    expect(log.text).toMatch(/levels: .*ERROR 8/);
  });

  it("teach-error for a missing path", async () => {
    await expect(fileMap({ path: fx("nope.zzz") })).rejects.toThrow(/Input not found/);
  });
});

describe("query_file", () => {
  it("ranks passages in a PDF with page locations", async () => {
    const r = await queryFile({ path: fx("sample.pdf"), query: "termination notice", max_results: 3 });
    expect(r.text).toMatch(/^\d+ matching passages? for "termination notice" in 1 file/);
    expect(r.text).toMatch(/#1 page 2/);
    expect(r.text).toContain("terminate");
    expect(r.rawBytes).toBeGreaterThan(0);
  });

  it("searches across formats with a glob and names the file", async () => {
    const r = await queryFile({ paths: [`${FIX}/sample.{md,docx,pdf,pptx,xlsx}`], query: "pricing" });
    expect(r.text).toMatch(/in 5 files/);
    expect(r.text).toMatch(/#\d sample\.pptx · slide 2/);
    expect(r.text).toMatch(/#\d sample\.xlsx · Notes rows 1–2|#\d sample\.xlsx · Notes rows 2/);
  });

  it("heading path shows in markdown/docx locations", async () => {
    const r = await queryFile({ path: fx("sample.md"), query: "thirty days" });
    expect(r.text).toMatch(/#1 lines? \d+(–\d+)? \(Contract > Termination\)/);
  });

  it("regex mode", async () => {
    const r = await queryFile({ path: fx("sample.log"), query: "status 50\\d", regex: true, max_results: 2 });
    expect(r.text).toMatch(/matching passages? for \/status 50\\d\//);
    expect(r.text).toContain("#1 ");
    await expect(queryFile({ path: fx("sample.log"), query: "(", regex: true })).rejects.toThrow(/Invalid regular expression/);
  });

  it("reports skipped files and keeps going (rule 8)", async () => {
    const r = await queryFile({ paths: [fx("sample.md"), fx("binary.bin")], query: "termination" });
    expect(r.text).toMatch(/skipped: binary\.bin \(.*binary/);
    expect(r.text).toMatch(/#1/);
  });

  it("teach-errors: no path, stop-words only", async () => {
    await expect(queryFile({ query: "x" })).rejects.toThrow(/No `path` or `paths`/);
    await expect(queryFile({ path: fx("sample.md"), query: "the of" })).rejects.toThrow(/no searchable words/);
  });

  it("caps results and says how to get more", async () => {
    const r = await queryFile({ path: fx("sample.log"), query: "GET api items", max_results: 1 });
    expect(r.text).toMatch(/showing 1 of \d+ — raise max_results/);
  });
});

describe("read_section", () => {
  it("markdown heading section", async () => {
    const r = await readSection({ path: fx("sample.md"), locator: { heading: "termination" } });
    expect(r.text).toMatch(/^sample\.md · section "Termination" \(lines 9–\d+\) · \d+ words/);
    expect(r.text).toContain("thirty days");
    expect(r.text).not.toContain("Setext Heading");
    expect(r.text).toMatch(/^ ?9\| ## Termination$/m);
  });

  it("line range with numbers", async () => {
    const r = await readSection({ path: fx("sample.ts"), locator: { lines: "8-10" } });
    expect(r.text).toContain("lines 8–10 of 31");
    expect(r.text).toMatch(/^ 8\| export function parseConfig/m);
    expect(r.text).not.toContain("loadConfig");
  });

  it("pdf pages", async () => {
    const r = await readSection({ path: fx("sample.pdf"), locator: { pages: "2" } });
    expect(r.text).toContain("page 2 of 3");
    expect(r.text).toContain("--- page 2 ---");
    expect(r.text).toContain("Termination");
    expect(r.text).not.toContain("Schedule A");
  });

  it("docx heading + paras", async () => {
    const r = await readSection({ path: fx("sample.docx"), locator: { heading: "Termination" } });
    expect(r.text).toMatch(/section "3\. Termination" \(¶\d+–\d+\)/);
    expect(r.text).toContain("30 days written notice");
    const p = await readSection({ path: fx("sample.docx"), locator: { paras: "2-3" } });
    expect(p.text).toContain("¶2 1. Introduction");
    expect(p.text).toContain("¶3 This agreement");
  });

  it("xlsx sheet range as a table", async () => {
    const r = await readSection({ path: fx("sample.xlsx"), locator: { sheet: "Sales", range: "A1:C3" } });
    expect(r.text).toContain("| row | A | B | C |");
    expect(r.text).toContain("| 3 | South | -40 | 45659 |");
    expect(r.text).not.toContain("| 4 |");
    const rows = await readSection({ path: fx("sample.xlsx"), locator: { sheet: "notes", range: "2-2" } });
    expect(rows.text).toContain("| 2 | Pricing review needed | Dana |");
  });

  it("pptx slide", async () => {
    const r = await readSection({ path: fx("sample.pptx"), locator: { slide: 2 } });
    expect(r.text).toContain("--- slide 2: Pricing Update ---");
    expect(r.text).toContain("Base price rises 4% in October");
    expect(r.text).not.toContain("Next Steps");
  });

  it("caps at max_tokens and tells how to continue", async () => {
    const r = await readSection({ path: fx("sample.log"), locator: { lines: "1-60" }, max_tokens: 100 });
    expect(r.text).toMatch(/truncated at ~100 tokens \(\d+ of 60 lines\) — continue with read_section\(\{ locator: \{ lines: "\d+-60" \} \}\)/);
  });

  it("teach-errors: no locator, wrong locator for kind, unknown heading, bad range", async () => {
    await expect(readSection({ path: fx("sample.pdf"), locator: {} })).rejects.toThrow(/No locator given.*For a PDF use \{ pages/);
    await expect(readSection({ path: fx("sample.pdf"), locator: { lines: "1-5" } })).rejects.toThrow(/only works for plain-text formats/);
    await expect(readSection({ path: fx("sample.md"), locator: { heading: "zzz" } })).rejects.toThrow(/No heading matches "zzz".*Available headings: "Contract"/);
    await expect(readSection({ path: fx("sample.xlsx"), locator: { sheet: "Nope" } })).rejects.toThrow(/Sheets: Sales, Notes/);
    await expect(readSection({ path: fx("sample.pdf"), locator: { pages: "9" } })).rejects.toThrow(/out of range/);
    const err = await readSection({ path: fx("sample.ts"), locator: { lines: "abc" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeachError);
  });
});

describe("extract", () => {
  it("kind=emails across files, deduped with locations", async () => {
    const r = await extract({ paths: [fx("sample.json"), fx("sample.md")], kind: "emails" });
    expect(r.text).toMatch(/^1 match \(1 unique\) for kind=emails in 2 files/);
    expect(r.text).toContain("dana@example.com — sample.json: line 1");
    expect(r.text).toMatch(/per file: sample\.json 1 · sample\.md 0/);
  });

  it("regex with capture group and counts", async () => {
    const r = await extract({ path: fx("sample.log"), pattern: "status (\\d{3})" });
    expect(r.text).toMatch(/^8 matches \(1 unique\)/);
    expect(r.text).toMatch(/^ {2}502 ×8 — line \d+, line \d+, line \d+ \(\+5 more\)$/m);
    const nd = await extract({ path: fx("sample.log"), pattern: "request ([0-9a-f]+)", dedupe: false, max_matches: 3 });
    expect(nd.text).toMatch(/showing 3 of 8/);
  });

  it("kind=numbers on a spreadsheet and dates on a csv", async () => {
    const r = await extract({ path: fx("sample.xlsx"), kind: "numbers", max_matches: 5 });
    expect(r.text).toContain("-40");
    const d = await extract({ path: fx("sample.csv"), kind: "dates" });
    expect(d.text).toMatch(/2025-01-02 — line 3/);
  });

  it("jq on JSON (system jq or fallback) and the fallback evaluator", async () => {
    const r = await extract({ path: fx("sample.json"), jq: ".items[].name" });
    expect(r.text).toContain('"alpha"');
    expect(r.text).toContain('"beta"');
    expect(r.text).toMatch(/engine: (jq|built-in subset)/);
    const data = JSON.parse('{"items":[{"name":"a","tags":["x","y"]},{"name":"b"}],"meta":{"n":2}}');
    expect(evalJqSubset(".items[].name", data)).toEqual(["a", "b"]);
    expect(evalJqSubset(".items[0].tags[1]", data)).toEqual(["y"]);
    expect(evalJqSubset(".meta | keys", data)).toEqual([["n"]]);
    expect(evalJqSubset(".items | length", data)).toEqual([2]);
    expect(evalJqSubset('.["meta"].n', data)).toEqual([2]);
    expect(() => evalJqSubset("select(.x)", data)).toThrow(/not supported/);
  });

  it("teach-errors: mode selection and skipped files", async () => {
    await expect(extract({ path: fx("sample.md") })).rejects.toThrow(/exactly one of pattern \| jq \| kind \(got none\)/);
    await expect(extract({ path: fx("sample.md"), kind: "urls", pattern: "x" })).rejects.toThrow(/got pattern \+ kind/);
    await expect(extract({ path: fx("sample.md"), pattern: "(" })).rejects.toThrow(/Invalid regular expression/);
    await expect(extract({ paths: [fx("sample.md"), fx("sample.csv")], jq: ".a" })).rejects.toThrow(/None of the 2 input\(s\).*jq needs a \.json file/s);
    const r = await extract({ paths: [fx("sample.json"), fx("sample.md")], jq: ".meta.count" });
    expect(r.text).toContain("2 — ");
    expect(r.text).toMatch(/skipped: sample\.md \(jq needs a \.json file\)/);
  });
});
