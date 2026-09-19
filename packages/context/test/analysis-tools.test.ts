import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { diffFiles, diffLines, hunksOf, parseTimestamp, queryTable, summarizeLog, templateOf, validateFile } from "../src/index.js";
import { fx } from "./helpers.js";

describe("query_table", () => {
  it("aggregates a CSV without returning rows", async () => {
    const r = await queryTable({ path: fx("sample.csv"), sql: "SELECT region, SUM(total) AS total FROM t GROUP BY 1 ORDER BY 2 DESC" });
    expect(r.text).toMatch(/^sample\.csv · 4 result rows · 2 columns/);
    expect(r.text).toContain("| region | total |");
    expect(r.text).toMatch(/\| North \| 1215\.5 \|/);
    expect(r.text).toMatch(/types: region VARCHAR · total DOUBLE/);
    expect(r.rawBytes).toBe(190);
  });

  it("caps rows, reports the total, and DESCRIBE works", async () => {
    const r = await queryTable({ path: fx("sample.csv"), sql: "SELECT * FROM t ORDER BY total", max_rows: 2 });
    expect(r.text).toContain("6 result rows (showing 2)");
    expect(r.text).toMatch(/capped at 2 rows/);
    const d = await queryTable({ path: fx("sample.csv"), sql: "DESCRIBE t" });
    expect(d.text).toContain("| region | VARCHAR");
  });

  it("SQL error teaches the columns", async () => {
    await expect(queryTable({ path: fx("sample.csv"), sql: "SELECT nope FROM t" })).rejects.toThrow(/SQL error:.*columns: region VARCHAR, total DOUBLE, date DATE, note VARCHAR/);
  });

  it("xlsx via sheet conversion, tsv, and `out` writes the full result", async () => {
    const x = await queryTable({ path: fx("sample.xlsx"), sql: "SELECT COUNT(*) AS n, SUM(total) AS s FROM t" });
    expect(x.text).toContain('sheet "Sales" (5 rows)');
    expect(x.text).toMatch(/\| 5 \| 2465\.5 \|/);
    const n = await queryTable({ path: fx("sample.xlsx"), sql: "SELECT owner FROM t", sheet: "Notes" });
    expect(n.text).toContain("| Dana |");
    const tsv = await queryTable({ path: fx("sample.tsv"), sql: "SELECT SUM(total) AS s FROM t" });
    expect(tsv.text).toMatch(/\| 4 \|/);
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-qt-"));
    const out = path.join(tmp, "neg.csv");
    const w = await queryTable({ path: fx("sample.csv"), sql: "SELECT * FROM t WHERE total < 0", out, max_rows: 1 });
    expect(w.text).toContain(`wrote: ${out}`);
    expect((await fs.readFile(out, "utf8")).trim().split("\n").length).toBe(3);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("parquet round-trip and unsupported extension", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-pq-"));
    const pq = path.join(tmp, "sales.parquet");
    const duck = await import("@duckdb/node-api");
    const inst = await duck.DuckDBInstance.create(":memory:");
    const conn = await inst.connect();
    await conn.run(`COPY (SELECT * FROM read_csv('${fx("sample.csv")}', header=true)) TO '${pq}' (FORMAT PARQUET)`);
    conn.closeSync();
    inst.closeSync();
    const r = await queryTable({ path: pq, sql: "SELECT COUNT(*) AS n FROM t WHERE total < 0" });
    expect(r.text).toMatch(/\| 2 \|/);
    await fs.rm(tmp, { recursive: true, force: true });
    await expect(queryTable({ path: fx("sample.md"), sql: "SELECT 1" })).rejects.toThrow(/supports CSV, TSV, Parquet, XLSX/);
  });
});

describe("summarize_log", () => {
  it("clusters, levels, timeline, samples", async () => {
    const r = await summarizeLog({ path: fx("sample.log"), max_clusters: 5 });
    expect(r.text).toMatch(/^sample\.log · 60 lines · 2026-09-18 \d\d:\d\d:\d\d → \d\d:\d\d:\d\d UTC \(\d+m\) · levels: INFO \d+/);
    expect(r.text).toMatch(/timeline \(\d+ buckets × \d+[sm]\)/);
    expect(r.text).toMatch(/#1 ×\d+ INFO \d\d:\d\d:\d\d→\d\d:\d\d:\d\d {2}INFO (GET <path> <n> <n>ms|user <n> logged in from <ip>)/);
    expect(r.text).toMatch(/e\.g\. 2026-09-18T/);
    expect(r.text).toMatch(/top 5 of \d+ clusters/);
    expect(r.text).toContain("next: summarize_log({ focus: 'errors' })");
  });

  it("focus errors isolates the burst", async () => {
    const r = await summarizeLog({ path: fx("sample.log"), focus: "errors" });
    expect(r.text).toMatch(/8 match focus errors/);
    expect(r.text).toMatch(/#1 ×8 ERROR .*upstream timeout after <n>ms for request <hex> \(status <n>\)/);
    expect(r.text).toMatch(/· focus \d/);
    const w = await summarizeLog({ path: fx("sample.log"), focus: "cache miss" });
    expect(w.text).toMatch(/match focus "cache miss"|match focus \/cache miss\/i/);
  });

  it("since filters and teaches when nothing matches", async () => {
    const r = await summarizeLog({ path: fx("sample.log"), since: "2026-09-18T10:05:00" });
    expect(r.text).toMatch(/60 lines \(\d+ since 2026-09-18T10:05:00\)/);
    await expect(summarizeLog({ path: fx("sample.log"), since: "2030-01-01" })).rejects.toThrow(/No lines at\/after 2030.*last timestamp in the file is 2026-09-18/);
    await expect(summarizeLog({ path: fx("sample.log"), since: "yesterday-ish" })).rejects.toThrow(/Bad `since`/);
  });

  it("timestamp + template helpers", () => {
    expect(parseTimestamp("2026-09-18T10:00:03 INFO x")?.text).toBe("2026-09-18T10:00:03");
    expect(parseTimestamp('127.0.0.1 - - [18/Sep/2026:10:00:00 +0000] "GET / HTTP/1.1"')?.ms).toBe(Date.UTC(2026, 8, 18, 10, 0, 0));
    expect(parseTimestamp("Sep 18 10:00:00 host sshd[12]: x")).not.toBeNull();
    expect(parseTimestamp("no time here")).toBeNull();
    expect(templateOf("2026-09-18T10:00:03 ERROR user 42 from 10.0.0.9 failed /var/log/x.log id 8f3a1ec4 0xdead", "2026-09-18T10:00:03")).toBe(
      "ERROR user <n> from <ip> failed <path> id <hex> <hex>",
    );
  });
});

describe("diff_files", () => {
  it("summary mode on markdown with heading locations", async () => {
    const r = await diffFiles({ a: fx("a.md"), b: fx("b.md") });
    expect(r.text).toMatch(/^a\.md → b\.md · 1 changed section · \+2 −1 lines · \d+ unchanged/);
    expect(r.text).toMatch(/#1 lines 9–11 \(Contract > Termination\)/);
    expect(r.text).toContain("− Either party may terminate with thirty days notice.");
    expect(r.text).toContain("+ Either party may terminate with sixty days notice.");
  });

  it("unified mode", async () => {
    const r = await diffFiles({ a: fx("a.md"), b: fx("b.md"), mode: "unified" });
    expect(r.text).toMatch(/^--- .*a\.md\n\+\+\+ .*b\.md\n@@ -\d+,\d+ \+\d+,\d+ @@/);
    expect(r.text).toContain("-Either party may terminate with thirty days notice.");
    expect(r.text).toContain("+Notice must be in writing.");
  });

  it("tables: added/removed/changed rows keyed on the first column", async () => {
    const r = await diffFiles({ a: fx("a.csv"), b: fx("b.csv") });
    expect(r.text).toMatch(/^a\.csv → b\.csv · 3 → 3 data rows · \+1 added · −1 removed · ~1 changed · 1 unchanged \(matched on first column\)/);
    expect(r.text).toContain("+ row 4: 4 | delta | 40");
    expect(r.text).toContain("− row 4: 3 | gamma | 30");
    expect(r.text).toContain("~ 2 (rows 3→3): total: 20 → 25");
  });

  it("identical files and docx vs docx", async () => {
    const same = await diffFiles({ a: fx("a.md"), b: fx("a.md") });
    expect(same.text).toMatch(/^No differences/);
    const d = await diffFiles({ a: fx("sample.docx"), b: fx("sample.docx"), mode: "summary" });
    expect(d.text).toMatch(/identical text \(\d+ paragraphs\)/);
  });

  it("diff engine basics", () => {
    const ops = diffLines(["a", "b", "c", "d"], ["a", "c", "d", "e"]);
    expect(ops.map((o) => o.type).join("")).toBe("eqdeleqeqadd");
    const h = hunksOf(ops, 0);
    expect(h.length).toBe(2);
    const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
    const bigB = [...big.slice(0, 1000), "inserted", ...big.slice(1000, 2000), ...big.slice(2001)];
    const ops2 = diffLines(big, bigB);
    expect(ops2.filter((o) => o.type === "add").length).toBe(1);
    expect(ops2.filter((o) => o.type === "del").length).toBe(1);
  });
});

describe("validate_file", () => {
  it("PASS for valid json/yaml/xml/csv/md", async () => {
    expect((await validateFile({ path: fx("sample.json") })).text).toMatch(/^PASS sample\.json · checks: encoding, json-syntax/);
    expect((await validateFile({ path: fx("sample.yaml") })).text).toMatch(/^PASS/);
    expect((await validateFile({ path: fx("sample.xml") })).text).toMatch(/^PASS/);
    expect((await validateFile({ path: fx("sample.csv") })).text).toMatch(/^PASS sample\.csv · checks: encoding, csv-structure \(6 rows × 4 cols\)/);
    expect((await validateFile({ path: fx("sample.md") })).text).toMatch(/^PASS sample\.md · checks: encoding, links \(0 internal checked\)/);
  });

  it("FAIL with line numbers: invalid json, bom json, bad yaml, bad xml, ragged csv", async () => {
    const j = await validateFile({ path: fx("invalid.json") });
    expect(j.text).toMatch(/^FAIL invalid\.json · 1 problem/);
    expect(j.text).toMatch(/✗ line 1, column \d+: /);
    const b = await validateFile({ path: fx("bom.json") });
    expect(b.text).toMatch(/✗ UTF-8 BOM at byte 0 — JSON parsers reject it/);
    const y = await validateFile({ path: fx("bad.yaml") });
    expect(y.text).toMatch(/✗ line \d+, column \d+: /);
    const x = await validateFile({ path: fx("bad.xml") });
    expect(x.text).toMatch(/✗ line \d+, column \d+: /);
    const c = await validateFile({ path: fx("ragged.csv") });
    expect(c.text).toMatch(/✗ row 3: 2 columns, header has 3/);
    expect(c.text).toMatch(/✗ row 4: 4 columns, header has 3/);
  });

  it("JSON Schema conformance", async () => {
    expect((await validateFile({ path: fx("sample.json"), schema: fx("schema.json") })).text).toMatch(/^PASS .*json-schema \(schema\.json\)/);
    const bad = await validateFile({ path: fx("bad-data.json"), schema: fx("schema.json") });
    expect(bad.text).toMatch(/✗ schema: \/items\/0\/price must be >= 0/);
    expect(bad.text).toMatch(/✗ schema: \/items\/1\/name must be string/);
    expect(bad.text).toMatch(/✗ schema: \/meta must have required property 'count'/);
    await expect(validateFile({ path: fx("sample.json"), schema: fx("nope.json") })).rejects.toThrow(/Schema not found/);
  });

  it("markdown links: broken links, anchors, images; externals skipped", async () => {
    const r = await validateFile({ path: fx("links.md") });
    expect(r.text).toMatch(/^FAIL links\.md · 3 problems/);
    expect(r.text).toMatch(/✗ line 3: broken link → nope\.md/);
    expect(r.text).toMatch(/✗ line 4: anchor #missing-anchor not found in this file \(have: #intro\)/);
    expect(r.text).toMatch(/✗ line 5: missing image\/asset → img\/none\.png/);
    expect(r.text).toMatch(/⚠ 1 external URL not checked/);
    expect(r.text).not.toMatch(/sample\.md|sample\.ts/);
  });

  it("binary file fails encoding", async () => {
    expect((await validateFile({ path: fx("binary.bin") })).text).toMatch(/FAIL binary\.bin.*\n {2}✗ binary content/);
  });
});
