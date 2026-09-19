#!/usr/bin/env node
// @author AVRG3
/**
 * Keeps the author signature on every source file in the repo.
 *   node scripts/sign.mjs          → adds "@author AVRG3" to any source file that lacks it
 *   node scripts/sign.mjs --check  → fails (exit 1) listing unsigned files; wired into `npm test`
 * The signature is a single comment line (JSDoc @author tag), placed after a shebang or inside a leading doc block.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIG = "@author AVRG3";
const EXT = new Set([".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "runs", "workspace"]);
const check = process.argv.includes("--check");

async function walk(dir, out) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) await walk(p, out);
    } else if (e.isFile() && EXT.has(path.extname(e.name))) {
      const rel = path.relative(ROOT, p).split(path.sep).join("/");
      // fixture *data* files stay untouched (tests assert their exact contents); fixture generators are code
      if (/(^|\/)fixtures\//.test(rel) && path.basename(p) !== "gen.ts") continue;
      out.push(p);
    }
  }
}

function sign(text) {
  if (text.includes(SIG)) return null;
  let head = "";
  let body = text;
  if (body.startsWith("#!")) {
    const nl = body.indexOf("\n");
    head = body.slice(0, nl + 1);
    body = body.slice(nl + 1);
  }
  if (body.startsWith("/**")) {
    const nl = body.indexOf("\n");
    const first = body.slice(0, nl + 1);
    if (!first.trimEnd().endsWith("*/")) return `${head}${first} * ${SIG}\n${body.slice(nl + 1)}`;
  }
  return `${head}// ${SIG}\n${body}`;
}

const files = [];
await walk(ROOT, files);
const missing = [];
for (const f of files.sort()) {
  const text = await fs.readFile(f, "utf8");
  const signed = sign(text);
  if (signed === null) continue;
  missing.push(path.relative(ROOT, f));
  if (!check) await fs.writeFile(f, signed);
}
if (check && missing.length) {
  console.error(`Unsigned source files (run \`node scripts/sign.mjs\`):\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log(check ? `signature check ok · ${files.length} files` : `signed ${missing.length} file(s) · ${files.length} checked`);
