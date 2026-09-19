/**
 * @author AVRG3
 * Benchmark harness (§8): each task both ways — naive (tokens to read the raw content) vs tool (tokens of the full response).
 * Writes bench/RESULTS.md and embeds the table into the package + root READMEs. Run: `npm run bench`.
 */
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type LibResult, diffFiles, extract, fileMap, finish, queryFile, queryTable, readSection, summarizeLog, validateFile } from "@tinytools/context";
import { byteLength, estimateTokens, fmtInt, fmtPct, formatDuration } from "@tinytools/shared";
import { BENCH_DIR, LARGE, REPO_DIR, generateFixtures } from "./fixtures.js";

interface Task {
  tool: string;
  task: string;
  fixture: string;
  run: () => Promise<LibResult>;
}

interface Row extends Task {
  naiveTokens: number;
  toolTokens: number;
  savedPct: number;
  ms: number;
  bytes: number;
}

const L = (f: string): string => path.join(LARGE, f);

const TASKS: Task[] = [
  { tool: "query_table", task: "total sales by region", fixture: "sales.csv", run: () => queryTable({ path: L("sales.csv"), sql: "SELECT region, ROUND(SUM(total),2) AS total FROM t GROUP BY 1 ORDER BY 2 DESC" }) },
  { tool: "query_table", task: "how many rows have a negative total", fixture: "sales.csv", run: () => queryTable({ path: L("sales.csv"), sql: "SELECT COUNT(*) AS n FROM t WHERE total < 0" }) },
  { tool: "query_table", task: "which columns exist and their types", fixture: "sales.csv", run: () => queryTable({ path: L("sales.csv"), sql: "DESCRIBE t" }) },
  { tool: "summarize_log", task: "what's causing the 5xx spike", fixture: "app.log", run: () => summarizeLog({ path: L("app.log"), focus: "errors" }) },
  { tool: "summarize_log", task: "summarize this log", fixture: "app.log", run: () => summarizeLog({ path: L("app.log") }) },
  { tool: "file_map", task: "what's in this 100-page contract", fixture: "contract.pdf", run: () => fileMap({ path: L("contract.pdf") }) },
  { tool: "query_file", task: "where does the contract discuss termination", fixture: "contract.pdf", run: () => queryFile({ path: L("contract.pdf"), query: "termination notice", max_results: 5 }) },
  { tool: "read_section", task: "read the termination pages (2 of 100)", fixture: "contract.pdf", run: () => readSection({ path: L("contract.pdf"), locator: { pages: "61-62" } }) },
  { tool: "file_map", task: "outline the 40-page handbook", fixture: "handbook.docx", run: () => fileMap({ path: L("handbook.docx") }) },
  { tool: "query_file", task: "does the handbook cover remote work", fixture: "handbook.docx", run: () => queryFile({ path: L("handbook.docx"), query: "remote work policy", max_results: 5 }) },
  { tool: "read_section", task: "read the handbook's Termination section", fixture: "handbook.docx", run: () => readSection({ path: L("handbook.docx"), locator: { heading: "Termination" } }) },
  { tool: "extract", task: "every email address in the handbook", fixture: "handbook.docx", run: () => extract({ path: L("handbook.docx"), kind: "emails" }) },
  { tool: "diff_files", task: "what changed between two handbook versions", fixture: "handbook.docx ↔ handbook-v2.docx", run: () => diffFiles({ a: L("handbook.docx"), b: L("handbook-v2.docx") }) },
  { tool: "file_map", task: "what's in this source tree", fixture: "src/", run: () => fileMap({ path: L("src"), depth: 3 }) },
  { tool: "file_map", task: "which functions are in this module", fixture: "src/…/paths.ts", run: () => fileMap({ path: path.join(L("src"), "packages-shared-src", "paths.ts") }) },
  { tool: "query_file", task: "which functions call resolveInputs", fixture: "src/**/*.ts", run: () => queryFile({ paths: [path.join(L("src"), "**", "*.ts")], query: "resolveInputs\\(", regex: true, max_results: 10, context_lines: 1 }) },
  { tool: "validate_file", task: "is this 100k-row CSV well-formed", fixture: "sales.csv", run: () => validateFile({ path: L("sales.csv") }) },
];

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(p);
    else if (e.isFile()) total += (await fs.stat(p)).size;
  }
  return total;
}

/** Production dependency closure of a package (hoisted node_modules), with sizes. */
async function depClosure(startPkgDir: string): Promise<Map<string, number>> {
  const nm = path.join(REPO_DIR, "node_modules");
  const sizes = new Map<string, number>();
  const seen = new Set<string>();
  const visit = async (pkgDir: string, name: string | null): Promise<void> => {
    let pj: { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    try {
      pj = JSON.parse(await fs.readFile(path.join(pkgDir, "package.json"), "utf8"));
    } catch {
      return;
    }
    if (name) sizes.set(name, name.startsWith("@tinytools/") ? await dirSize(path.join(pkgDir, "dist")) : await dirSize(pkgDir));
    for (const dep of Object.keys({ ...(pj.dependencies ?? {}), ...(pj.optionalDependencies ?? {}) })) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      const candidates = [path.join(pkgDir, "node_modules", dep), path.join(nm, dep)];
      for (const c of candidates) {
        try {
          const real = await fs.realpath(c);
          await visit(real, dep);
          break;
        } catch {
          /* try next */
        }
      }
    }
  };
  await visit(startPkgDir, null);
  return sizes;
}

const mb = (n: number): string => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

async function replaceBetween(file: string, start: string, end: string, body: string): Promise<boolean> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return false;
  }
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a === -1 || b === -1 || b < a) return false;
  const next = `${text.slice(0, a + start.length)}\n${body}\n${text.slice(b)}`;
  await fs.writeFile(file, next);
  return true;
}

async function main(): Promise<void> {
  await generateFixtures(process.argv.includes("--force"));
  const rows: Row[] = [];
  console.log("\nrunning tasks…");
  for (const t of TASKS) {
    const t0 = performance.now();
    let result: LibResult;
    try {
      result = await t.run();
    } catch (e) {
      console.log(`  FAIL ${t.tool} · ${t.task}: ${(e as Error).message}`);
      continue;
    }
    const ms = performance.now() - t0;
    const text = finish(result, ms);
    const toolTokens = estimateTokens(byteLength(text));
    const naiveTokens = estimateTokens(result.rawBytes);
    const savedPct = naiveTokens > 0 ? Math.max(0, (1 - toolTokens / naiveTokens) * 100) : 0;
    rows.push({ ...t, naiveTokens, toolTokens, savedPct, ms, bytes: result.rawBytes });
    console.log(`  ${t.tool.padEnd(14)} ${fmtInt(naiveTokens).padStart(9)} → ${fmtInt(toolTokens).padStart(6)} tokens · ${fmtPct(savedPct).padStart(6)}% · ${formatDuration(ms)}  ${t.task}`);
  }

  const fixtureStats: string[] = [];
  for (const f of ["sales.csv", "app.log", "contract.pdf", "handbook.docx"]) {
    const st = await fs.stat(L(f));
    fixtureStats.push(`${f} ${mb(st.size)}`);
  }
  const srcFiles = (await fs.readdir(L("src"), { recursive: true })).filter((f) => f.endsWith(".ts")).length;

  const closure = await depClosure(path.join(REPO_DIR, "packages", "context"));
  const total = [...closure.values()].reduce((a, b) => a + b, 0);
  const duck = [...closure.entries()].filter(([k]) => k.startsWith("@duckdb/")).reduce((a, [, v]) => a + v, 0);
  const top = [...closure.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const date = new Date().toISOString().slice(0, 10);
  const machine = `${os.platform()} ${os.arch()}, ${os.cpus()[0]?.model ?? "cpu"}, node ${process.version}`;
  const table = [
    "| Tool | Task | Naive tokens | Tool tokens | Saved | Time |",
    "|---|---|---:|---:|---:|---:|",
    ...rows.map((r) => `| \`${r.tool}\` | ${r.task} (${r.fixture}) | ${fmtInt(r.naiveTokens)} | ${fmtInt(r.toolTokens)} | ${fmtPct(r.savedPct)}% | ${formatDuration(r.ms)} |`),
  ].join("\n");
  const quotable = rows.map((r) => `${r.tool} · ${fmtInt(r.naiveTokens)} → ${fmtInt(r.toolTokens)} tokens · ${fmtPct(r.savedPct)}% · ${formatDuration(r.ms)}`).join("\n");
  const totalNaive = rows.reduce((a, r) => a + r.naiveTokens, 0);
  const totalTool = rows.reduce((a, r) => a + r.toolTokens, 0);
  const summary = `**${rows.length} tasks · ${fmtInt(totalNaive)} naive tokens → ${fmtInt(totalTool)} tool tokens · ${fmtPct((1 - totalTool / totalNaive) * 100)}% saved overall · median ${formatDuration(rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0)} per call**`;
  const fixtures = `Fixtures (generated locally, seeded): ${fixtureStats.join(" · ")} (100,000 rows · 50,000 lines · 100 pages · ~18k words) · src/ ${srcFiles} TypeScript files.`;
  const method = "Naive = tokens (bytes/4) an agent would spend reading the raw content the task needs — the file for text formats, the extracted text for PDF/DOCX (the built-in can't open them at all), the whole file for a section read. Tool = tokens of the tool's complete response including its savings line.";

  const results = `# Benchmark results — tiny-context

_Generated ${date} on ${machine}._

${summary}

${table}

${fixtures}

${method}

## Quotable

\`\`\`
${quotable}
\`\`\`

## Install size (production dependency closure of @tinytools/context)

Total **${mb(total)}** across ${closure.size} packages — **${mb(total - duck)} without DuckDB** (optional; only \`query_table\` needs it).
Largest: ${top.map(([k, v]) => `${k} ${mb(v)}`).join(" · ")}.
`;
  await fs.writeFile(path.join(BENCH_DIR, "RESULTS.md"), results);
  console.log(`\nwrote bench/RESULTS.md`);

  const embed = `${summary}\n\n${table}\n\n_${fixtures}_ · _Generated ${date}; re-run with \`npm run bench\`._`;
  const sizeEmbed = `Install size: **${mb(total)}** (${closure.size} packages) — **${mb(total - duck)} without DuckDB**, which only \`query_table\` needs. Largest: ${top
    .slice(0, 4)
    .map(([k, v]) => `${k} ${mb(v)}`)
    .join(" · ")}. _Measured ${date} by \`npm run bench\`._`;
  for (const f of [path.join(REPO_DIR, "packages", "context", "README.md"), path.join(REPO_DIR, "README.md")]) {
    const ok = await replaceBetween(f, "<!-- bench:start -->", "<!-- bench:end -->", embed);
    const ok2 = await replaceBetween(f, "<!-- size:start -->", "<!-- size:end -->", sizeEmbed);
    console.log(`${ok ? "embedded bench" : "no bench markers"}${ok2 ? " + size" : ""} in ${path.relative(REPO_DIR, f)}`);
  }
}

await main();
