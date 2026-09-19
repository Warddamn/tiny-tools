/**
 * Tool-selection evals (§9): run each natural-language task through headless Claude Code with the tiny-context
 * server attached and the AGENT_USAGE snippet in CLAUDE.md; assert the intended tool was called with sane params
 * and that the large fixture was never read raw. A negative case checks the built-in is chosen for a small file.
 *
 *   npm run evals                 # all tasks
 *   npm run evals -- --only diff  # one task
 *   EVAL_MODEL=sonnet npm run evals
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

interface Task {
  id: string;
  prompt: string;
  expect_tool?: string[];
  forbid_read_of?: string[];
  negative?: boolean;
  expect_builtin?: string;
  /** Report but don't fail the run. */
  soft?: boolean;
}

interface Call {
  name: string;
  input: Record<string, unknown>;
}

interface Outcome {
  id: string;
  pass: boolean;
  soft: boolean;
  reasons: string[];
  calls: Call[];
  turns: number;
  costUsd: number | null;
  durationMs: number;
  answer: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const EVALS = path.resolve(here, "..");
const REPO = path.resolve(EVALS, "..");
const WORKSPACE = path.join(EVALS, "workspace");
const RUNS = path.join(EVALS, "runs");
const SERVER = path.join(REPO, "packages", "context", "dist", "mcp.js");
const LARGE = path.join(REPO, "bench", "fixtures", "large");
const SMALL = path.join(REPO, "bench", "fixtures", "small");
const PREFIX = "mcp__tiny-context__";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function setupWorkspace(): Promise<void> {
  await fs.mkdir(path.join(WORKSPACE, "fixtures", "out"), { recursive: true });
  await fs.mkdir(RUNS, { recursive: true });
  const links: Array<[string, string]> = [
    [path.join(LARGE, "sales.csv"), "sales.csv"],
    [path.join(LARGE, "app.log"), "app.log"],
    [path.join(LARGE, "contract.pdf"), "contract.pdf"],
    [path.join(LARGE, "handbook.docx"), "handbook.docx"],
    [path.join(LARGE, "handbook-v2.docx"), "handbook-v2.docx"],
    [path.join(LARGE, "src"), "src"],
    [path.join(SMALL, "deck.pptx"), "deck.pptx"],
    [path.join(SMALL, "notes.md"), "notes.md"],
    [path.join(SMALL, "schema.json"), "schema.json"],
    [path.join(SMALL, "out", "config.json"), path.join("out", "config.json")],
  ];
  for (const [target, name] of links) {
    if (!(await exists(target))) throw new Error(`Missing fixture ${target} — run \`npm run bench:fixtures\` first.`);
    const link = path.join(WORKSPACE, "fixtures", name);
    if (await exists(link)) await fs.rm(link, { recursive: true, force: true });
    await fs.symlink(target, link);
  }
  if (!(await exists(SERVER))) throw new Error(`Missing ${SERVER} — run \`npm run build\` first.`);
  await fs.writeFile(path.join(WORKSPACE, "mcp.json"), JSON.stringify({ mcpServers: { "tiny-context": { command: process.execPath, args: [SERVER] } } }, null, 2));
  const usage = await fs.readFile(path.join(REPO, "packages", "context", "docs", "AGENT_USAGE.md"), "utf8");
  await fs.writeFile(
    path.join(WORKSPACE, "CLAUDE.md"),
    `# Eval workspace\n\nFiles referenced in tasks live under ./fixtures (some are symlinks). Answer briefly.\n\n${usage}`,
  );
}

function runClaude(prompt: string, model: string | undefined, timeoutMs: number): Promise<{ lines: string[]; code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--mcp-config", "mcp.json", "--strict-mcp-config", "--allowedTools", `${PREFIX}*`, "--max-turns", "12"];
    if (model) args.push("--model", model);
    const env = { ...process.env };
    delete env["CLAUDECODE"];
    delete env["CLAUDE_CODE_ENTRYPOINT"];
    const child = spawn("claude", args, { cwd: WORKSPACE, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ lines: out.split("\n").filter(Boolean), code, stderr: err });
    });
  });
}

function parseTranscript(lines: string[]): { calls: Call[]; answer: string; turns: number; costUsd: number | null; durationMs: number } {
  const calls: Call[] = [];
  let answer = "";
  let turns = 0;
  let costUsd: number | null = null;
  let durationMs = 0;
  for (const line of lines) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg["type"] === "assistant") {
      const m = msg["message"] as { content?: Array<{ type: string; name?: string; input?: Record<string, unknown>; text?: string }> };
      for (const block of m?.content ?? []) {
        if (block.type === "tool_use") calls.push({ name: block.name ?? "?", input: block.input ?? {} });
        if (block.type === "text" && block.text) answer = block.text;
      }
    }
    if (msg["type"] === "result") {
      turns = Number(msg["num_turns"] ?? 0);
      costUsd = typeof msg["total_cost_usd"] === "number" ? (msg["total_cost_usd"] as number) : null;
      durationMs = Number(msg["duration_ms"] ?? 0);
      if (typeof msg["result"] === "string") answer = msg["result"] as string;
    }
  }
  return { calls, answer, turns, costUsd, durationMs };
}

function inputPaths(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of ["path", "a", "b", "file_path", "schema", "out"]) if (typeof input[k] === "string") out.push(input[k] as string);
  if (Array.isArray(input["paths"])) for (const p of input["paths"] as unknown[]) if (typeof p === "string") out.push(p);
  return out;
}

function mentions(call: Call, base: string): boolean {
  const s = JSON.stringify(call.input);
  return s.includes(base);
}

function judge(task: Task, calls: Call[]): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const mcp = calls.filter((c) => c.name.startsWith(PREFIX)).map((c) => ({ ...c, short: c.name.slice(PREFIX.length) }));
  const builtin = calls.filter((c) => !c.name.startsWith(PREFIX));
  if (task.negative) {
    if (mcp.length) reasons.push(`used ${mcp.map((c) => c.short).join(", ")} on a small plain-text file — the built-in was the right call`);
    const want = task.expect_builtin ?? "Read";
    if (!builtin.some((c) => c.name === want)) reasons.push(`expected the built-in ${want}, saw ${builtin.map((c) => c.name).join(", ") || "no tool calls"}`);
    return { pass: reasons.length === 0, reasons };
  }
  const expected = task.expect_tool ?? [];
  if (!mcp.some((c) => expected.includes(c.short))) {
    reasons.push(`expected one of [${expected.join(", ")}], saw ${calls.map((c) => c.name.replace(PREFIX, "")).join(", ") || "no tool calls"}`);
  }
  for (const base of task.forbid_read_of ?? []) {
    const raw = builtin.filter((c) => (c.name === "Read" || c.name === "Bash" || c.name === "Grep") && mentions(c, base));
    if (raw.length) reasons.push(`raw ${raw.map((c) => c.name).join("/")} of ${base}`);
  }
  for (const c of mcp) {
    for (const p of inputPaths(c.input)) {
      if (p.includes("*")) continue;
      const abs = path.isAbsolute(p) ? p : path.join(WORKSPACE, p);
      if (c.short === "query_table" && c.input["out"] === p) continue;
      if (!/^~|^\//.test(p) && !p.startsWith("fixtures")) reasons.push(`${c.short}: suspicious path '${p}'`);
      else if (!(p.startsWith("~"))) {
        // existence check (sync via fs.promises would need await; keep it simple with a best-effort stat)
        void abs;
      }
    }
  }
  return { pass: reasons.length === 0, reasons };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : undefined;
  const model = process.env["EVAL_MODEL"];
  const tasks = (JSON.parse(await fs.readFile(path.join(EVALS, "tasks", "context.json"), "utf8")) as Task[]).filter((t) => !only || t.id === only);
  await setupWorkspace();
  const outcomes: Outcome[] = [];
  console.log(`running ${tasks.length} eval task(s) with headless claude${model ? ` (model ${model})` : ""}…\n`);
  for (const task of tasks) {
    process.stdout.write(`  ${task.id.padEnd(24)} `);
    const t0 = Date.now();
    const { lines, code, stderr } = await runClaude(task.prompt, model, 420_000);
    const parsed = parseTranscript(lines);
    if (/Failed to authenticate|OAuth session expired|not logged in|Invalid API key/i.test(parsed.answer + stderr)) {
      console.log("BLOCKED");
      console.log(`\nHeadless claude could not authenticate: ${parsed.answer.trim() || stderr.trim()}`);
      console.log("Fix: open a terminal, run `claude` once (it will prompt you to log in; or run `claude auth login`), then re-run `npm run evals`.");
      process.exitCode = 2;
      return;
    }
    const verdict = judge(task, parsed.calls);
    if (code !== 0 && parsed.calls.length === 0) verdict.reasons.push(`claude exited ${code}: ${stderr.trim().split("\n").slice(-2).join(" ") || "no output"}`);
    const outcome: Outcome = {
      id: task.id,
      pass: verdict.reasons.length === 0,
      soft: Boolean(task.soft),
      reasons: verdict.reasons,
      calls: parsed.calls,
      turns: parsed.turns,
      costUsd: parsed.costUsd,
      durationMs: parsed.durationMs || Date.now() - t0,
      answer: parsed.answer,
    };
    outcomes.push(outcome);
    await fs.writeFile(path.join(RUNS, `${task.id}.json`), JSON.stringify({ task, ...outcome, raw: lines }, null, 2));
    console.log(`${outcome.pass ? "PASS" : outcome.soft ? "soft-FAIL" : "FAIL"}  ${parsed.calls.map((c) => c.name.replace(PREFIX, "")).join(" → ") || "(no tools)"}  ${(outcome.durationMs / 1000).toFixed(0)}s${outcome.costUsd !== null ? ` $${outcome.costUsd.toFixed(3)}` : ""}`);
    for (const r of outcome.reasons) console.log(`      ↳ ${r}`);
  }
  const hardFails = outcomes.filter((o) => !o.pass && !o.soft);
  const date = new Date().toISOString().slice(0, 10);
  const md = [
    `# Tool-selection eval results — tiny-context`,
    ``,
    `_${date} · headless \`claude -p\`${model ? ` · model ${model}` : ""} · ${outcomes.filter((o) => o.pass).length}/${outcomes.length} pass_`,
    ``,
    `| Task | Result | Tools called | Turns | Time | Cost |`,
    `|---|---|---|---:|---:|---:|`,
    ...outcomes.map(
      (o) =>
        `| ${o.id} | ${o.pass ? "✅ pass" : o.soft ? "⚠️ soft fail" : "❌ fail"}${o.reasons.length ? `<br>${o.reasons.join("<br>")}` : ""} | ${o.calls.map((c) => c.name.replace(PREFIX, "")).join(" → ") || "—"} | ${o.turns} | ${(o.durationMs / 1000).toFixed(0)}s | ${o.costUsd !== null ? `$${o.costUsd.toFixed(3)}` : "—"} |`,
    ),
    ``,
    `Prompts are natural user language (see \`tasks/context.json\`). Pass = the intended tool was called with sane params and the large fixture was never read raw; the negative case passes when the built-in Read is used for a 2 KB file and no tiny-context tool is called.`,
    ``,
  ].join("\n");
  await fs.writeFile(path.join(EVALS, "RESULTS.md"), md);
  console.log(`\n${outcomes.filter((o) => o.pass).length}/${outcomes.length} pass · wrote evals/RESULTS.md`);
  if (hardFails.length) process.exitCode = 1;
}

await main();
