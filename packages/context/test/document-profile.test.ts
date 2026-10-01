// @author AVRG3
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extract } from "../src/lib/extract.js";
import { applyDocumentProfile, DocumentProfile } from "../src/lib/document-profile.js";
import { fx } from "./helpers.js";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";

const recipe = { version: 1, name: "Recurring report v1", formats: ["text", "markdown", "docx", "pdf"], anchors: ["Monthly report"], fields: [
  { name: "reference", label: "Reference:", type: "text" },
  { name: "total", label: "Total:", type: "decimal" },
  { name: "date", label: "Date:", type: "date" },
] };
const sample = "Monthly report\nReference: A-001\nTotal: 9007199254740993.10\nDate: 2026-09-30\n";
let dir: string, profile: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-profile-test-"));
  profile = path.join(dir, "profile.json");
  await fs.writeFile(profile, JSON.stringify(recipe));
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });
async function input(name = "report.txt", text = sample): Promise<string> {
  const file = path.join(dir, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); return file;
}
async function run(paths: string[], extra = {}) {
  return JSON.parse((await extract({ paths, profile, ...extra })).text);
}

describe("saved document profiles", () => {
  it("reuses one profile across reordered documents and preserves exact strings/provenance", async () => {
    const first = await input();
    const second = await input("second.md", "New preamble\nDate: 2026-10-01\nMonthly report\nTotal: 0\nReference: B-002\nUnrelated text\n");
    const r = await run([first, second]);
    expect(r.matched).toBe(2); expect(r.needs_review).toBe(0);
    expect(r.rows[0].fields.total).toEqual({ value: "9007199254740993.10", at: "line 3" });
    expect(r.rows[1].fields.reference).toEqual({ value: "B-002", at: "line 5" });
    expect(r.profile_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await fs.readFile(profile, "utf8")).toBe(JSON.stringify(recipe));
  });
  it.each([
    [sample.replace("Monthly report", "Quarterly report"), "required_anchor_missing"],
    [sample.replace("Total: 9007199254740993.10\n", ""), "total:missing"],
    [sample + "Total: 9007199254740993.10\n", "total:ambiguous"],
    [sample.replace("2026-09-30", "2026-02-30"), "date:invalid_date"],
    [sample.replace("9007199254740993.10", "$1,234.56"), "total:invalid_decimal"],
    [sample.replace("Reference: A-001", "Reference:"), "reference:invalid_text"],
    [sample.replace("Reference: A-001", "Reference: " + "x".repeat(513)), "reference:invalid_text"],
    [sample.replace("Total:", "TOTAL:"), "total:missing"],
    [sample.replace("Total: 9007199254740993.10", "Total:\n9007199254740993.10"), "total:invalid_decimal"],
  ])("fails closed on mismatched fields (%s)", async (text, issue) => {
    const r = await run([await input("bad.txt", text)]);
    expect(r.needs_review).toBe(1); expect(r.rows[0].issues).toContain(issue);
    expect(r.rows[0]).not.toHaveProperty("fields");
  });
  it("rechecks changed documents and changed profiles without a stale learned value", async () => {
    const f = await input(); expect((await run([f])).matched).toBe(1);
    await fs.writeFile(f, sample.replace("A-001", "A-999"));
    const next = await run([f]); expect(next.rows[0].fields.reference.value).toBe("A-999");
    await fs.writeFile(profile, JSON.stringify({ ...recipe, anchors: ["Wrong document"] }));
    const changed = await run([f]); expect(changed.matched).toBe(0); expect(changed.profile_sha256).not.toBe(next.profile_sha256);
  });
  it("reports the exact saved profile bytes, including a UTF-8 BOM, in the audit hash", async () => {
    const bytes = Buffer.from("\ufeff" + JSON.stringify(recipe)); await fs.writeFile(profile, bytes);
    const r = await run([await input()]); expect(r.matched).toBe(1);
    expect(r.profile_sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
  it("preserves distinct full paths for same-named files and reports mixed batch failures", async () => {
    const files = [await input("one/report.txt"), await input("two/report.txt", "Wrong"), fx("notpdf.pdf")];
    const r = await run(files); expect(r.files).toBe(3); expect(r.matched).toBe(1); expect(r.needs_review).toBe(2);
    expect(r.rows.map((x: { file: string }) => x.file).sort()).toEqual([...files].sort());
  });
  it("rejects invalid/ambiguous or executable profiles", async () => {
    const file = await input();
    for (const bad of [ { ...recipe, version: 2 }, { ...recipe, script: "run" }, { ...recipe, anchors: [] }, { ...recipe, fields: [recipe.fields[0], recipe.fields[0]] }, { ...recipe, fields: [{ name: "field", label: "X", pattern: "(x+)+" }] } ]) {
      await fs.writeFile(profile, JSON.stringify(bad)); await expect(run([file])).rejects.toThrow(/Invalid document profile/);
    }
    await fs.writeFile(profile, '{"version":1,"version":2}'); await expect(run([file])).rejects.toThrow(/duplicate object key/);
    await fs.writeFile(profile, " ".repeat(16_385)); await expect(run([file])).rejects.toThrow(/16 KiB/);
  });
  it("protects sources, recipe and existing reports; exports every checked row", async () => {
    const file = await input();
    for (const out of [file, profile]) await expect(run([file], { out })).rejects.toThrow(/same as an input/);
    const out = path.join(dir, "report.jsonl"); await fs.writeFile(out, "KEEP");
    const r = await run([file, await input("bad.txt", "bad")], { out, max_matches: 1 });
    expect(r.omitted).toBe(1); expect(r.report).toBe(path.join(dir, "report-1.jsonl"));
    expect(await fs.readFile(out, "utf8")).toBe("KEEP");
    const rows = (await fs.readFile(r.report, "utf8")).trim().split("\n").map(s => JSON.parse(s));
    expect(rows).toHaveLength(3); expect(rows[0].needs_review).toBe(1); expect(rows[2].status).toBe("needs_review");
    expect(await fs.readFile(file, "utf8")).toBe(sample);
  });
  it("bounds Unicode previews without corrupting JSON, with exact omitted counts", async () => {
    const files = await Promise.all(Array.from({ length: 50 }, (_, i) => input(`${i}.txt`, sample.replace("A-001", "界".repeat(500)))));
    const raw = await extract({ paths: files, profile });
    expect(Buffer.byteLength(raw.text)).toBeLessThan(16_000);
    const r = JSON.parse(raw.text); expect(r.files).toBe(50); expect(r.matched).toBe(50); expect(r.omitted).toBe(50 - r.rows.length);
  });
  it("shows review items before matches so a failure after the preview limit needs no repeat call", async () => {
    const good = await input(), bad = await input("last.txt", "Wrong document");
    const r = await run([good, bad], { max_matches: 1 });
    expect(r.rows[0].file).toBe(bad); expect(r.rows[0].status).toBe("needs_review"); expect(r.omitted).toBe(1);
  });
  it("enforces input and batch limits and avoids reading unrelated formats", async () => {
    const big = await input("big.txt", "x".repeat(2 * 1024 * 1024 + 1));
    const r = await run([big, fx("sample.json"), profile]);
    expect(r.matched).toBe(0); expect(r.needs_review).toBe(3);
    expect(r.rows[0].issues).toContain("source_limit_or_not_regular_file");
    await expect(run(Array.from({ length: 101 }, () => big))).rejects.toThrow(/1–100/);
  });
  it("rejects competing modes and out without profile", async () => {
    const file = await input();
    for (const extra of [{ pattern: "abc" }, { kind: "emails" }, { dedupe: false }]) await expect(run([file], extra)).rejects.toThrow(/cannot be combined/);
    await expect(extract({ path: file, kind: "emails", out: "x" })).rejects.toThrow(/requires profile/);
  });
  it("handles DOCX paragraph line breaks and PDF page locations without positional assumptions", () => {
    for (const kind of ["docx", "pdf"] as const) {
      const r = applyDocumentProfile({ path: "test", kind, bytes: 10, textBytes: 100, meta: {}, blocks: [{ text: sample, loc: kind === "docx" ? { para: 4 } : { page: 2, line: 1 } }] }, DocumentProfile.parse(recipe));
      expect(r.status).toBe("matched"); expect(r.fields?.reference?.at).toBe(kind === "docx" ? "¶4" : "page 2, line 1");
    }
  });
  it("CLI applies a profile without accidentally enabling the legacy dedupe mode", async () => {
    const file = await input();
    const stdout = execFileSync(process.execPath, ["packages/context/dist/cli.js", "extract", file, "--profile", profile], { encoding: "utf8" });
    expect(stdout).toContain('"matched":1');
  });
  it("reads real text-layer PDF and DOCX documents using the existing parsers", async () => {
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), page = pdf.addPage();
    sample.trim().split("\n").forEach((line, i) => page.drawText(line, { x: 40, y: 700 - i * 25, size: 12, font }));
    const pdfPath = path.join(dir, "report.pdf"); await fs.writeFile(pdfPath, await pdf.save());
    const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + sample.trim().split("\n").map(line => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("") + '</w:body></w:document>';
    const docxPath = path.join(dir, "report.docx"); await fs.writeFile(docxPath, zipSync({ "word/document.xml": strToU8(xml) }));
    const r = await run([pdfPath, docxPath]); expect(r.matched).toBe(2);
    expect(r.rows[0].fields.total.at).toBe("page 1, line 3");
    expect(r.rows[1].fields.total.at).toBe("¶3");
  });
});
