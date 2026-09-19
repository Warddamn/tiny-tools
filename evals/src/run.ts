// @author AVRG3
/**
 * Tool-selection + honest-comparison evals (§9). Each task runs through headless Claude Code in one of four modes:
 *   none    — no tiny-context server, no snippet (what an agent has today)
 *   tools   — server attached, no snippet (descriptions alone must trigger)
 *   snippet — server attached + AGENT_USAGE snippet in CLAUDE.md (the recommended install)
 *   hook    — server attached + the Read guard hook, no snippet (the smart path is the default path)
 * Every mode allows the same built-ins (Bash, Read, Grep, Glob). A task passes only if the answer is correct
 * AND the tool-selection rules hold (intended tool used; the large fixture never read raw; negative case uses Read).
 *
 *   npm run evals                      # snippet mode
 *   npm run evals -- --mode hook       # one mode
 *   npm run evals -- --compare         # all four modes → evals/COMPARISON.md
 *   npm run evals -- --only diff       # one task
 *   EVAL_MODEL=sonnet npm run evals
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

type Mode = "none" | "tools" | "snippet" | "hook";
const MODES: Mode[] = ["none", "tools", "snippet", "hook"];

interface Task {
  id: string;
  prompt: string;
  expect_tool?: string[];
  forbid_read_of?: string[];
  negative?: boolean;
  expect_builtin?: string;
  soft?: boolean;
  /** Answer is correct if ANY of these regexes (case-insensitive) matches. */
  expect_answer_any?: string[];
  /** Answer is correct only if ALL of these regexes match. */
  expect_answer_all?: string[];
  /** Answer is correct if at least `min` of these regexes match. */
  expect_answer_min?: { of: string[]; min: number };
}

interface Call {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Set from the matching tool_result. */
  error?: string | null;
  denied?: boolean;
  blockedByHook?: boolean;
}

interface Outcome {
  mode: Mode;
  id: string;
  pass: boolean;
  correct: boolean;
  soft: boolean;
  reasons: string[];
  calls: Call[];
  turns: number;
  totalTokens: number;
  finalContext: number;
  costUsd: number | null;
  durationMs: number;
  answer: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const EVALS = path.resolve(here, "..");
const REPO = path.resolve(EVALS, "..");
const RUNS = path.join(EVALS, "runs");
const SERVER = path.join(REPO, "packages", "context", "dist", "mcp.js");
const HOOK = path.join(REPO, "packages", "context", "hooks", "read-guard.mjs");
const LARGE = path.join(REPO, "bench", "fixtures", "large");
const SMALL = path.join(REPO, "bench", "fixtures", "small");
const PREFIX = "mcp__tiny-context__";
const BUILTINS = ["Bash", "Read", "Grep", "Glob"];

async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(src: string, dst: string): Promise<void> {
  const st = await fs.stat(src);
  if (st.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    for (const e of await fs.readdir(src)) await copyTree(path.join(src, e), path.join(dst, e));
  } else await fs.copyFile(src, dst);
}

async function setupWorkspace(mode: Mode): Promise<string> {
  const ws = path.join(EVALS, "workspace", mode);
  await fs.rm(ws, { recursive: true, force: true });
  await fs.mkdir(path.join(ws, "fixtures", "out"), { recursive: true });
  await fs.mkdir(RUNS, { recursive: true });
  const files: Array<[string, string]> = [
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
  for (const [src, name] of files) {
    if (!(await exists(src))) throw new Error(`Missing fixture ${src} — run \`npm run bench:fixtures\` first.`);
    await copyTree(src, path.join(ws, "fixtures", name));
  }
  if (mode !== "none" && !(await exists(SERVER))) throw new Error(`Missing ${SERVER} — run \`npm run build\` first.`);
  const base = "# Eval workspace\n\nFiles referenced in tasks live under ./fixtures. Answer briefly and directly.\n";
  const usage = await fs.readFile(path.join(REPO, "packages", "context", "docs", "AGENT_USAGE.md"), "utf8");
  await fs.writeFile(path.join(ws, "CLAUDE.md"), mode === "snippet" ? `${base}\n${usage}` : base);
  if (mode !== "none") {
    await fs.writeFile(path.join(ws, "mcp.json"), JSON.stringify({ mcpServers: { "tiny-context": { command: process.execPath, args: [SERVER] } } }, null, 2));
  }
  if (mode === "hook") {
    const settings = {
      hooks: { PreToolUse: [{ matcher: "Read", hooks: [{ type: "command", command: `"${process.execPath}" "${HOOK}"`, timeout: 30 }] }] },
    };
    await fs.writeFile(path.join(ws, "settings.json"), JSON.stringify(settings, null, 2));
  }
  return ws;
}

function runClaude(ws: string, mode: Mode, prompt: string, model: string | undefined, timeoutMs: number): Promise<{ lines: string[]; code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const allowed = [...BUILTINS, ...(mode === "none" ? [] : [`${PREFIX}*`])];
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--max-turns", "12", "--strict-mcp-config", "--allowedTools", ...allowed];
    if (mode !== "none") args.push("--mcp-config", "mcp.json");
    if (mode === "hook") args.push("--settings", "settings.json");
    if (model) args.push("--model", model);
    const env = { ...process.env };
    delete env["CLAUDECODE"];
    delete env["CLAUDE_CODE_ENTRYPOINT"];
    const child = spawn("claude", args, { cwd: ws, env, stdio: ["ignore", "pipe", "pipe"] });
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

interface Parsed {
  calls: Call[];
  answer: string;
  turns: number;
  costUsd: number | null;
  durationMs: number;
  totalTokens: number;
  finalContext: number;
  authError: string | null;
}

function parseTranscript(lines: string[]): Parsed {
  const calls: Call[] = [];
  const byId = new Map<string, Call>();
  let answer = "";
  let turns = 0;
  let costUsd: number | null = null;
  let durationMs = 0;
  let totalTokens = 0;
  let finalContext = 0;
  let authError: string | null = null;
  for (const line of lines) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const type = msg["type"];
    if (type === "assistant") {
      const m = msg["message"] as { content?: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }>; usage?: Record<string, number> };
      for (const block of m?.content ?? []) {
        if (block.type === "tool_use") {
          const c: Call = { id: block.id ?? "", name: block.name ?? "?", input: block.input ?? {} };
          calls.push(c);
          byId.set(c.id, c);
        }
        if (block.type === "text" && block.text) answer = block.text;
      }
      const u = m?.usage;
      if (u) finalContext = (u["input_tokens"] ?? 0) + (u["cache_read_input_tokens"] ?? 0) + (u["cache_creation_input_tokens"] ?? 0);
    } else if (type === "user") {
      const m = msg["message"] as { content?: unknown };
      if (Array.isArray(m?.content)) {
        for (const block of m.content as Array<{ type: string; tool_use_id?: string; is_error?: boolean; content?: unknown }>) {
          if (block.type !== "tool_result" || !block.tool_use_id) continue;
          const c = byId.get(block.tool_use_id);
          if (!c) continue;
          const text = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
          if (block.is_error) c.error = text.slice(0, 300);
          if (/read guard/i.test(text)) c.blockedByHook = true;
          if (/requested permissions|haven't granted|permission/i.test(text) && block.is_error) c.denied = true;
        }
      }
    } else if (type === "result") {
      turns = Number(msg["num_turns"] ?? 0);
      costUsd = typeof msg["total_cost_usd"] === "number" ? (msg["total_cost_usd"] as number) : null;
      durationMs = Number(msg["duration_ms"] ?? 0);
      const u = (msg["usage"] ?? {}) as Record<string, number>;
      totalTokens = (u["input_tokens"] ?? 0) + (u["cache_read_input_tokens"] ?? 0) + (u["cache_creation_input_tokens"] ?? 0) + (u["output_tokens"] ?? 0);
      for (const d of (msg["permission_denials"] ?? []) as Array<{ tool_use_id?: string }>) {
        const c = d.tool_use_id ? byId.get(d.tool_use_id) : undefined;
        if (c) c.denied = true;
      }
      if (typeof msg["result"] === "string") answer = msg["result"] as string;
      if (msg["is_error"] && /authenticate|OAuth|logged in|API key/i.test(answer)) authError = answer;
    }
  }
  return { calls, answer, turns, costUsd, durationMs, totalTokens, finalContext, authError };
}

function mentions(call: Call, base: string): boolean {
  return JSON.stringify(call.input).includes(base);
}

function judgeAnswer(task: Task, answer: string): { correct: boolean; why: string | null } {
  const test = (re: string): boolean => new RegExp(re, "i").test(answer);
  if (task.expect_answer_all && !task.expect_answer_all.every(test)) return { correct: false, why: `answer missing one of: ${task.expect_answer_all.join(" · ")}` };
  if (task.expect_answer_any && !task.expect_answer_any.some(test)) return { correct: false, why: `answer lacks any of: ${task.expect_answer_any.join(" · ")}` };
  if (task.expect_answer_min) {
    const n = task.expect_answer_min.of.filter(test).length;
    if (n < task.expect_answer_min.min) return { correct: false, why: `answer names ${n} of ${task.expect_answer_min.of.length} expected items (need ${task.expect_answer_min.min})` };
  }
  return { correct: true, why: null };
}

function judgeTools(task: Task, mode: Mode, calls: Call[]): string[] {
  const reasons: string[] = [];
  const mcp = calls.filter((c) => c.name.startsWith(PREFIX)).map((c) => ({ ...c, short: c.name.slice(PREFIX.length) }));
  const builtin = calls.filter((c) => !c.name.startsWith(PREFIX));
  const rawReads = (base: string): Call[] => builtin.filter((c) => (c.name === "Read" || c.name === "Bash" || c.name === "Grep") && mentions(c, base) && !c.denied && !c.blockedByHook && !c.error);
  if (task.negative) {
    if (mcp.length) reasons.push(`used ${mcp.map((c) => c.short).join(", ")} on a small plain-text file — the built-in was the right call`);
    const want = task.expect_builtin ?? "Read";
    if (!builtin.some((c) => c.name === want && !c.denied && !c.error)) reasons.push(`expected a successful built-in ${want}, saw ${calls.map((c) => c.name.replace(PREFIX, "")).join(", ") || "no tool calls"}`);
    return reasons;
  }
  if (mode === "none") return reasons; // nothing to select from; correctness + cost tell the story
  const expected = task.expect_tool ?? [];
  if (!mcp.some((c) => expected.includes(c.short))) reasons.push(`expected one of [${expected.join(", ")}], saw ${calls.map((c) => c.name.replace(PREFIX, "")).join(", ") || "no tool calls"}`);
  for (const base of task.forbid_read_of ?? []) {
    const raw = rawReads(base);
    if (raw.length) reasons.push(`raw ${raw.map((c) => c.name).join("/")} of ${base} (${raw.length}×)`);
  }
  return reasons;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function toolChain(o: Outcome): string {
  return (
    o.calls
      .map((c) => `${c.name.replace(PREFIX, "")}${c.blockedByHook ? "⛔" : c.denied ? "✗" : c.error ? "!" : ""}`)
      .join(" → ") || "—"
  );
}

async function runMode(mode: Mode, tasks: Task[], model: string | undefined): Promise<Outcome[]> {
  const ws = await setupWorkspace(mode);
  const outcomes: Outcome[] = [];
  console.log(`\n[${mode}] ${tasks.length} task(s)${model ? ` · model ${model}` : ""}`);
  for (const task of tasks) {
    process.stdout.write(`  ${task.id.padEnd(22)} `);
    const t0 = Date.now();
    const { lines, code, stderr } = await runClaude(ws, mode, task.prompt, model, 480_000);
    const p = parseTranscript(lines);
    if (p.authError) {
      console.log("BLOCKED");
      console.log(`\nHeadless claude could not authenticate: ${p.authError}\nFix: run \`claude auth login\` in a terminal, then re-run.`);
      process.exit(2);
    }
    const reasons = judgeTools(task, mode, p.calls);
    const { correct, why } = judgeAnswer(task, p.answer);
    if (!correct && why) reasons.push(why);
    if (code !== 0 && p.calls.length === 0) reasons.push(`claude exited ${code}: ${stderr.trim().split("\n").slice(-2).join(" ") || "no output"}`);
    const o: Outcome = {
      mode,
      id: task.id,
      pass: reasons.length === 0,
      correct,
      soft: Boolean(task.soft),
      reasons,
      calls: p.calls,
      turns: p.turns,
      totalTokens: p.totalTokens,
      finalContext: p.finalContext,
      costUsd: p.costUsd,
      durationMs: p.durationMs || Date.now() - t0,
      answer: p.answer,
    };
    outcomes.push(o);
    await fs.writeFile(path.join(RUNS, `${mode}-${task.id}.json`), JSON.stringify({ task, ...o, raw: lines }, null, 2));
    console.log(`${o.pass ? "PASS" : o.soft ? "soft" : "FAIL"} ${o.correct ? "✓" : "✗"}  ${toolChain(o)}  ${(o.durationMs / 1000).toFixed(0)}s · ${fmt(o.totalTokens)} tok${o.costUsd !== null ? ` · $${o.costUsd.toFixed(3)}` : ""}`);
    for (const r of o.reasons) console.log(`      ↳ ${r}`);
  }
  return outcomes;
}

function modeTable(outcomes: Outcome[], mode: Mode, model: string | undefined, date: string): string {
  const passN = outcomes.filter((o) => o.pass).length;
  return [
    `# Tool-selection eval results — tiny-context (mode: ${mode})`,
    ``,
    `_${date} · headless \`claude -p\`${model ? ` · model ${model}` : ""} · ${passN}/${outcomes.length} pass · pass = correct answer AND tool rules hold_`,
    ``,
    `| Task | Result | Correct | Tools called (⛔ blocked by hook · ✗ denied · ! error) | Turns | Tokens | Time | Cost |`,
    `|---|---|---|---|---:|---:|---:|---:|`,
    ...outcomes.map(
      (o) =>
        `| ${o.id} | ${o.pass ? "✅" : o.soft ? "⚠️ soft" : "❌"}${o.reasons.length ? `<br>${o.reasons.join("<br>")}` : ""} | ${o.correct ? "✓" : "✗"} | ${toolChain(o)} | ${o.turns} | ${fmt(o.totalTokens)} | ${(o.durationMs / 1000).toFixed(0)}s | ${o.costUsd !== null ? `$${o.costUsd.toFixed(3)}` : "—"} |`,
    ),
    ``,
  ].join("\n");
}

function comparison(all: Map<Mode, Outcome[]>, tasks: Task[], model: string | undefined, date: string): string {
  const modes = [...all.keys()];
  const head = `| Task | ${modes.map((m) => `${m}: ok / turns / tokens / $`).join(" | ")} |`;
  const sep = `|---|${modes.map(() => "---").join("|")}|`;
  const rows = tasks.map((t) => {
    const cells = modes.map((m) => {
      const o = all.get(m)!.find((x) => x.id === t.id);
      if (!o) return "—";
      return `${o.pass ? "✅" : o.correct ? "⚠️" : "❌"} / ${o.turns} / ${fmt(o.totalTokens)} / ${o.costUsd !== null ? o.costUsd.toFixed(2) : "?"}`;
    });
    return `| ${t.id} | ${cells.join(" | ")} |`;
  });
  const totals = modes.map((m) => {
    const os = all.get(m)!;
    const sum = (f: (o: Outcome) => number): number => os.reduce((a, o) => a + f(o), 0);
    return `| **${m}** | ${os.filter((o) => o.pass).length}/${os.length} pass · ${os.filter((o) => o.correct).length}/${os.length} correct | ${fmt(sum((o) => o.turns) / os.length * 10) === "0" ? "" : (sum((o) => o.turns) / os.length).toFixed(1)} | ${fmt(sum((o) => o.totalTokens))} | $${sum((o) => o.costUsd ?? 0).toFixed(2)} | ${(sum((o) => o.durationMs) / 1000).toFixed(0)}s |`;
  });
  return [
    `# Honest comparison — the same ${tasks.length} tasks in ${modes.length} conditions`,
    ``,
    `_${date} · headless \`claude -p\`${model ? ` · model ${model}` : ""} · every condition allows the same built-ins (Bash, Read, Grep, Glob) · max 12 turns._`,
    ``,
    `- **none** — no tiny-context, no snippet (what an agent has today)`,
    `- **tools** — server attached, no snippet in CLAUDE.md (descriptions alone)`,
    `- **snippet** — server attached + the 6-line AGENT_USAGE snippet in CLAUDE.md (recommended install)`,
    `- **hook** — server attached + the Read guard hook (Read of PDF/Office/>20 KB files is intercepted and answered with an outline), no snippet`,
    ``,
    `Cell = pass? / turns / total tokens processed (input + cache + output, all turns) / cost in USD. ✅ pass · ⚠️ correct answer but tool rules broken · ❌ wrong or no answer.`,
    ``,
    head,
    sep,
    ...rows,
    ``,
    `| Condition | Pass / correct | Avg turns | Total tokens | Total cost | Total time |`,
    `|---|---|---:|---:|---:|---:|`,
    ...totals,
    ``,
  ].join("\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (k: string): string | undefined => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const only = arg("--only");
  const modeArg = (arg("--mode") ?? "snippet") as Mode;
  const compare = argv.includes("--compare");
  const model = process.env["EVAL_MODEL"];
  const tasks = (JSON.parse(await fs.readFile(path.join(EVALS, "tasks", "context.json"), "utf8")) as Task[]).filter((t) => !only || t.id === only);
  if (!MODES.includes(modeArg)) throw new Error(`--mode must be one of ${MODES.join(", ")}`);
  const date = new Date().toISOString().slice(0, 10);
  const all = new Map<Mode, Outcome[]>();
  for (const mode of compare ? MODES : [modeArg]) all.set(mode, await runMode(mode, tasks, model));
  for (const [mode, outcomes] of all) {
    await fs.writeFile(path.join(EVALS, `RESULTS-${mode}.md`), modeTable(outcomes, mode, model, date));
    if (mode === "snippet") await fs.writeFile(path.join(EVALS, "RESULTS.md"), modeTable(outcomes, mode, model, date));
  }
  if (compare) {
    await fs.writeFile(path.join(EVALS, "COMPARISON.md"), comparison(all, tasks, model, date));
    console.log("\nwrote evals/COMPARISON.md");
  }
  for (const [mode, outcomes] of all) console.log(`[${mode}] ${outcomes.filter((o) => o.pass).length}/${outcomes.length} pass · ${outcomes.filter((o) => o.correct).length} correct · $${outcomes.reduce((a, o) => a + (o.costUsd ?? 0), 0).toFixed(2)}`);
  const hard = [...all.values()].flat().filter((o) => !o.pass && !o.soft && o.mode !== "none");
  if (hard.length && !compare) process.exitCode = 1;
}

await main();
