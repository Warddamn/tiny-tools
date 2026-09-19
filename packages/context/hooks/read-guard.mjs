#!/usr/bin/env node
// @author AVRG3
/**
 * tiny-context read guard — a Claude Code PreToolUse hook for the built-in Read tool.
 *
 * When the agent is about to Read a PDF/DOCX/PPTX/XLSX (which Read can't open) or a text file over
 * TINY_CONTEXT_READ_GUARD_KB (default 20 KB) without offset/limit, the hook denies the Read and hands
 * back the file's outline (file_map) plus the exact follow-up calls. The agent never has to *choose*
 * the tool — the smart path becomes the default path. Any failure inside the hook allows the Read.
 *
 * settings.json:
 *   { "hooks": { "PreToolUse": [ { "matcher": "Read",
 *       "hooks": [ { "type": "command", "command": "node \"/abs/path/to/hooks/read-guard.mjs\"", "timeout": 30 } ] } ] } }
 */
import { readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OFFICE = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".xlsm"]);
const NATIVE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ipynb"]);
const KB = Number(process.env["TINY_CONTEXT_READ_GUARD_KB"] ?? 20);
const MAX_REASON = 6000;

const allow = () => process.exit(0);

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  allow();
}
if (input.tool_name !== "Read") allow();
const fp = input.tool_input?.file_path;
if (typeof fp !== "string" || !fp) allow();
if (input.tool_input.offset !== undefined || input.tool_input.limit !== undefined) allow(); // already slicing

let st;
try {
  st = statSync(fp);
} catch {
  allow();
}
if (!st.isFile()) allow();
const ext = path.extname(fp).toLowerCase();
if (NATIVE.has(ext)) allow();
const office = OFFICE.has(ext);
if (!office && st.size <= KB * 1024) allow();

try {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const lib = await import(pathToFileURL(path.join(here, "..", "dist", "index.js")).href);
  const t0 = performance.now();
  const result = await lib.fileMap({ path: fp });
  const text = lib.finish(result, performance.now() - t0);
  const why = office ? `Read cannot open ${ext} files` : `this file is ${(st.size / 1024).toFixed(0)} KB`;
  const reason =
    `tiny-context read guard: ${why}, so here is its outline instead of the whole file:\n\n` +
    `${text.length > MAX_REASON ? `${text.slice(0, MAX_REASON)}\n…(outline truncated)` : text}\n\n` +
    `Next: read_section({ path, locator: { pages | lines | heading | paras | sheet+range | slide } }) for just the part you need · ` +
    `query_file({ path, query }) to find where something is · query_table({ path, sql }) for CSV/XLSX questions · ` +
    `summarize_log({ path }) for logs. If you truly need raw text, Read again with offset and limit.`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
} catch {
  allow();
}
