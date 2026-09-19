/**
 * Generates benchmark fixtures. Large ones go to bench/fixtures/large (gitignored), small ones to bench/fixtures/small (committed).
 * Deterministic (seeded) so numbers are reproducible. Run: `npm run bench:fixtures`.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { toCsvLine } from "@tinytools/shared";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { type DocxPara, buildDocx, buildPptx } from "./ooxml.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const BENCH_DIR = path.resolve(here, "..");
export const REPO_DIR = path.resolve(BENCH_DIR, "..");
export const LARGE = path.join(BENCH_DIR, "fixtures", "large");
export const SMALL = path.join(BENCH_DIR, "fixtures", "small");

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

const WORDS =
  "the agreement party parties shall provide services client company term notice written days business material breach cure period payment invoice fees expenses liability indemnify confidential information disclosure obligations warranty representation governing law jurisdiction dispute arbitration assignment amendment waiver severability entire force majeure schedule exhibit deliverable milestone acceptance review approval employee policy equipment reimbursement leave holiday benefits conduct performance security data privacy retention audit compliance training onboarding renewal supplier vendor quality inspection delivery warehouse inventory sample colorway design product development".split(
    " ",
  );

function sentence(r: () => number, min = 8, max = 18): string {
  const n = int(r, min, max);
  const w: string[] = [];
  for (let i = 0; i < n; i++) w.push(pick(r, WORDS));
  w[0] = w[0]![0]!.toUpperCase() + w[0]!.slice(1);
  return `${w.join(" ")}.`;
}
function paragraph(r: () => number, sentences = 5): string {
  const s: string[] = [];
  for (let i = 0; i < sentences; i++) s.push(sentence(r));
  return s.join(" ");
}

// ───────────── CSV ─────────────
const REGIONS = ["North", "South", "East", "West", "Central"] as const;
const STATUS = ["paid", "paid", "paid", "pending", "refunded"] as const;
function csvRows(r: () => number, n: number): string[] {
  const prices = Array.from({ length: 20 }, (_, i) => Math.round((10 + i * 7.35) * 100) / 100);
  const out = [toCsvLine(["id", "date", "region", "product", "qty", "unit_price", "total", "customer_id", "status"])];
  for (let i = 1; i <= n; i++) {
    const pi = int(r, 0, 19);
    const qty = int(r, 1, 20);
    const refund = r() < 0.03;
    const total = Math.round(qty * prices[pi]! * 100) / 100 * (refund ? -1 : 1);
    const day = int(r, 0, 364);
    const d = new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10);
    out.push(toCsvLine([i, d, pick(r, REGIONS), `P${String(pi + 1).padStart(3, "0")}`, qty, prices[pi], total, `C${int(r, 1000, 9999)}`, refund ? "refunded" : pick(r, STATUS)]));
  }
  return out;
}

// ───────────── LOG ─────────────
function logLines(r: () => number, n: number, bursts: Array<[number, number]>): string[] {
  const out: string[] = [];
  let t = Date.UTC(2026, 8, 18, 0, 0, 0);
  const resources = ["items", "orders", "users", "carts", "search"];
  for (let i = 0; i < n; i++) {
    t += int(r, 0, 3000);
    const ts = new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
    const inBurst = bursts.some(([a, b]) => i >= a && i < b);
    const x = r();
    if (inBurst && x < 0.7) {
      const id = Math.floor(r() * 0xffffffff).toString(16).padStart(8, "0");
      out.push(x < 0.5 ? `${ts} ERROR upstream timeout after 5000ms for request ${id} (status 502)` : `${ts} ERROR db pool exhausted, dropping request ${id} (status 503)`);
      continue;
    }
    if (x < 0.55) out.push(`${ts} INFO GET /api/${pick(r, resources)}/${int(r, 1, 99999)} ${r() < 0.98 ? 200 : 404} ${int(r, 2, 180)}ms`);
    else if (x < 0.75) out.push(`${ts} INFO user ${int(r, 100, 99999)} logged in from 10.${int(r, 0, 255)}.${int(r, 0, 255)}.${int(r, 1, 254)}`);
    else if (x < 0.85) out.push(`${ts} WARN cache miss for key ${pick(r, resources)}:${int(r, 1, 99999)}`);
    else if (x < 0.93) out.push(`${ts} DEBUG worker ${int(r, 1, 8)} heartbeat ok`);
    else if (x < 0.98) out.push(`${ts} INFO db query took ${int(r, 1, 900)}ms rows=${int(r, 0, 5000)}`);
    else out.push(`${ts} WARN slow request /api/${pick(r, resources)}/${int(r, 1, 99999)} took ${int(r, 1000, 8000)}ms`);
  }
  return out;
}

// ───────────── PDF ─────────────
const SECTIONS = [
  "Definitions", "Engagement", "Scope of Services", "Deliverables", "Milestones", "Acceptance", "Fees", "Invoicing", "Expenses", "Taxes",
  "Confidentiality", "Data Protection", "Intellectual Property", "Warranties", "Indemnification", "Termination", "Effects of Termination", "Limitation of Liability",
  "Insurance", "Force Majeure", "Assignment", "Notices", "Governing Law", "Dispute Resolution", "General Provisions",
];
const TERMINATION_LINES = [
  "16.1 Either party may terminate this Agreement for convenience upon sixty (60) days written notice to the other party.",
  "16.2 Either party may terminate this Agreement for cause if the other party commits a material breach and fails to cure",
  "such breach within thirty (30) days after receiving written notice describing the breach in reasonable detail.",
  "16.3 The Company may terminate immediately if the Supplier becomes insolvent or ceases to carry on business.",
  "16.4 Termination shall not affect any rights or obligations accrued prior to the effective date of termination.",
];

async function buildPdf(r: () => number, pages: number, sectionsEvery: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Master Services Agreement");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const LINES_PER_PAGE = 44;
  let section = 0;
  for (let p = 1; p <= pages; p++) {
    const page = doc.addPage([612, 792]);
    let y = 740;
    const lines: Array<{ text: string; bold?: boolean }> = [];
    if ((p - 1) % sectionsEvery === 0 && section < SECTIONS.length) {
      section++;
      lines.push({ text: `${section}. ${SECTIONS[section - 1]}`, bold: true });
      lines.push({ text: "" });
      if (SECTIONS[section - 1] === "Termination") for (const l of TERMINATION_LINES) lines.push({ text: l });
    }
    while (lines.length < LINES_PER_PAGE) {
      const para = paragraph(r, 3);
      const words = para.split(" ");
      let line = "";
      for (const w of words) {
        if ((line + " " + w).length > 92) {
          lines.push({ text: line });
          line = w;
        } else line = line ? `${line} ${w}` : w;
      }
      if (line) lines.push({ text: line });
      lines.push({ text: "" });
    }
    for (const l of lines.slice(0, LINES_PER_PAGE)) {
      if (l.text) page.drawText(l.text, { x: 60, y, size: 10, font: l.bold ? bold : font });
      y -= 15.5;
    }
    page.drawText(`Page ${p} of ${pages}`, { x: 270, y: 40, size: 9, font });
  }
  return doc.save();
}

// ───────────── DOCX ─────────────
const HANDBOOK = [
  "Purpose", "Scope", "Employment Classification", "Working Hours", "Attendance", "Compensation", "Payroll", "Expense Reimbursement", "Benefits Overview", "Health Insurance",
  "Retirement Plan", "Remote Work", "Equipment", "Information Security", "Acceptable Use", "Code of Conduct", "Anti-Harassment", "Performance Reviews", "Training", "Leave of Absence",
  "Paid Time Off", "Holidays", "Parental Leave", "Travel", "Safety", "Discipline", "Grievances", "Termination", "Return of Property", "Acknowledgement",
];
function handbookParas(r: () => number, headings: string[], parasPer: number, variant: 1 | 2): DocxPara[] {
  const out: DocxPara[] = [{ text: "Employee Handbook", style: "Title" }];
  headings.forEach((h, i) => {
    out.push({ text: `${i + 1}. ${h}`, style: "Heading1" });
    for (let k = 0; k < parasPer; k++) {
      let text = paragraph(r, 6);
      if (h === "Remote Work" && k === 0) text = `Employees may work remotely up to three days per week with manager approval; the remote work policy applies to all full-time staff. ${text}`;
      if (h === "Remote Work" && k === 1) text = `Requests go to hr@example.com and equipment questions to it-help@example.com. ${text}`;
      if (h === "Payroll" && k === 0) text = `Payroll runs on the 15th and the last business day of each month; questions to payroll@example.com. ${text}`;
      if (h === "Termination" && k === 0) text = `Employment may be terminated by either party with ${variant === 1 ? "two weeks" : "four weeks"} written notice. ${text}`;
      if (variant === 2 && h === "Holidays" && k === 1) text = `Juneteenth is observed as a company holiday from 2027. ${text}`;
      out.push({ text });
    }
    if (variant === 2 && h === "Travel") out.push({ text: "Rail travel under four hours is preferred over flights where practical." });
    if (i % 4 === 1) out.push({ text: `${i + 1}.1 Related procedures`, style: "Heading2" }, { text: paragraph(r, 4) });
  });
  return out;
}

async function writeIf(file: string, make: () => Promise<Uint8Array | string> | Uint8Array | string, force: boolean): Promise<void> {
  if (!force) {
    try {
      await fs.stat(file);
      console.log(`  keep   ${path.relative(BENCH_DIR, file)}`);
      return;
    } catch {
      /* build */
    }
  }
  const data = await make();
  await fs.writeFile(file, data);
  const size = (await fs.stat(file)).size;
  console.log(`  wrote  ${path.relative(BENCH_DIR, file)}  ${(size / 1024).toFixed(0)} KB`);
}

async function copyTree(src: string, dst: string): Promise<number> {
  let n = 0;
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) n += await copyTree(s, d);
    else if (e.isFile()) {
      await fs.copyFile(s, d);
      n++;
    }
  }
  return n;
}

export async function generateFixtures(force = false): Promise<void> {
  await fs.mkdir(LARGE, { recursive: true });
  await fs.mkdir(path.join(SMALL, "out"), { recursive: true });
  console.log("large fixtures →", LARGE);
  await writeIf(path.join(LARGE, "sales.csv"), () => `${csvRows(rng(1), 100_000).join("\n")}\n`, force);
  await writeIf(path.join(LARGE, "app.log"), () => `${logLines(rng(2), 50_000, [[20_000, 20_600], [41_000, 41_300]]).join("\n")}\n`, force);
  await writeIf(path.join(LARGE, "contract.pdf"), () => buildPdf(rng(3), 100, 4), force);
  await writeIf(path.join(LARGE, "handbook.docx"), () => buildDocx(handbookParas(rng(4), HANDBOOK, 6, 1), "Employee Handbook"), force);
  await writeIf(path.join(LARGE, "handbook-v2.docx"), () => buildDocx(handbookParas(rng(4), HANDBOOK, 6, 2), "Employee Handbook"), force);
  const srcDir = path.join(LARGE, "src");
  try {
    await fs.rm(srcDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  let files = 0;
  for (const pkg of ["packages/shared/src", "packages/context/src", "bench/src", "evals/src"]) {
    files += await copyTree(path.join(REPO_DIR, pkg), path.join(srcDir, pkg.replace(/\//g, "-")));
  }
  console.log(`  wrote  fixtures/large/src  (${files} files — snapshot of this repo's own MIT-licensed sources)`);

  console.log("small fixtures →", SMALL);
  await writeIf(path.join(SMALL, "sales-small.csv"), () => `${csvRows(rng(11), 200).join("\n")}\n`, force);
  await writeIf(path.join(SMALL, "app-small.log"), () => `${logLines(rng(12), 500, [[200, 240]]).join("\n")}\n`, force);
  await writeIf(path.join(SMALL, "contract-small.pdf"), () => buildPdf(rng(13), 5, 1), force);
  await writeIf(path.join(SMALL, "handbook-small.docx"), () => buildDocx(handbookParas(rng(14), HANDBOOK.slice(0, 6), 3, 1), "Employee Handbook"), force);
  await writeIf(
    path.join(SMALL, "deck.pptx"),
    () =>
      buildPptx([
        { title: "Q3 Business Review", bullets: ["Prepared by the PD team"] },
        { title: "Highlights", bullets: ["Sample throughput up 18%", "Two new suppliers onboarded"] },
        { title: "Pricing Update", bullets: ["Base price rises 4% in October", "Volume discounts unchanged"] },
        { title: "Risks", bullets: ["Freight delays in Q4", "Wool cost volatility"] },
        { title: "Next Steps", bullets: ["Confirm pricing with sales", "Finalize holiday colorways"] },
      ]),
    force,
  );
  await writeIf(
    path.join(SMALL, "notes.md"),
    () =>
      [
        "# Team notes — week 38",
        "",
        "## Meeting",
        "",
        "The weekly sync is at 3pm on Thursday in the small conference room. Dana will bring the sample tracker.",
        "",
        "## Follow-ups",
        "",
        "- Confirm the rug pile photos are exported at 4K.",
        "- Ask the warehouse about the delayed container.",
        "- Colorway app: check the new palette export against the showroom lighting.",
        "",
        "## Parking lot",
        "",
        "Ideas we didn't get to: a shared inbox for supplier questions, and a template for QC reports.",
        "",
      ].join("\n"),
    force,
  );
  await writeIf(
    path.join(SMALL, "out", "config.json"),
    () => JSON.stringify({ name: "colorway-export", version: 3, retries: 2, targets: [{ id: "showroom", dpi: 300 }, { id: "web", dpi: 72 }] }, null, 2),
    force,
  );
  await writeIf(
    path.join(SMALL, "schema.json"),
    () =>
      JSON.stringify(
        {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          required: ["name", "version", "targets"],
          properties: {
            name: { type: "string" },
            version: { type: "integer", minimum: 1 },
            retries: { type: "integer", minimum: 0 },
            targets: { type: "array", items: { type: "object", required: ["id", "dpi"], properties: { id: { type: "string" }, dpi: { type: "integer" } } } },
          },
        },
        null,
        2,
      ),
    force,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateFixtures(process.argv.includes("--force"));
}
