#!/usr/bin/env node
// @author AVRG3
/**
 * One-command rename for publishing. Sets the GitHub owner and the npm scope everywhere they appear:
 *   node scripts/set-owner.mjs --github <owner> --scope <npm-scope>
 * e.g. node scripts/set-owner.mjs --github AVRG3 --scope tiny_tools_pw
 *      node scripts/set-owner.mjs --github Warddamn --scope avrg3
 * Touches: package.json (name/repository/homepage/bugs/mcpName), server.json, README snippets, AGENT_USAGE, evals/bench sources.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const github = arg("--github");
const scope = (arg("--scope") ?? "tiny_tools_pw").replace(/^@/, "");
if (!github) {
  console.error("usage: node scripts/set-owner.mjs --github <owner> [--scope <npm-scope>]");
  process.exit(1);
}
const cfg = { command: "npx", args: ["-y", "-p", `@${scope}/context`, "tiny-context-mcp"] };
const cursorB64 = encodeURIComponent(Buffer.from(JSON.stringify(cfg)).toString("base64"));
const vscodeUrl = encodeURIComponent("vscode:mcp/install?" + encodeURIComponent(JSON.stringify({ name: "tiny-context", command: "npx", args: cfg.args })));
const repoUrl = `https://github.com/${github}/tiny-tools`;
const nsOwner = github.toLowerCase();

async function walk(dir, out) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!["node_modules", "dist", ".git", "fixtures", "runs", "workspace"].includes(e.name)) await walk(p, out);
    } else if (/\.(json|md|ts|mjs|yml)$/.test(e.name)) out.push(p);
  }
}

// 1. package.json files: scope + repository metadata
const pkgs = ["package.json", "packages/shared/package.json", "packages/context/package.json", "bench/package.json", "evals/package.json"];
for (const rel of pkgs) {
  const p = path.join(ROOT, rel);
  const j = JSON.parse(await fs.readFile(p, "utf8"));
  if (j.name?.startsWith("@")) j.name = `@${scope}/${j.name.split("/")[1]}`;
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const k of Object.keys(j[field] ?? {})) {
      if (k.startsWith("@") && ["shared", "context"].includes(k.split("/")[1])) {
        const v = j[field][k];
        delete j[field][k];
        j[field][`@${scope}/${k.split("/")[1]}`] = v;
      }
    }
  }
  const sub = rel.replace(/\/?package\.json$/, "");
  j.repository = { type: "git", url: `git+${repoUrl}.git`, ...(sub ? { directory: sub } : {}) };
  j.homepage = sub ? `${repoUrl}/tree/main/${sub}#readme` : `${repoUrl}#readme`;
  j.bugs = { url: `${repoUrl}/issues` };
  if (j.mcpName) j.mcpName = `io.github.${nsOwner}/${j.mcpName.split("/")[1]}`;
  await fs.writeFile(p, `${JSON.stringify(j, null, 2)}\n`);
}

// 2. text substitutions everywhere else
const files = [];
await walk(ROOT, files);
let changed = 0;
for (const f of files) {
  if (pkgs.some((p) => path.join(ROOT, p) === f)) continue;
  const before = await fs.readFile(f, "utf8");
  const after = before
    .replace(/@[\w.-]+\/(shared|context|images|pdf|video|audio|verify|transcribe|bgremove)\b/g, `@${scope}/$1`)
    .replace(/io\.github\.[\w-]+\//g, `io.github.${nsOwner}/`)
    .replace(/https:\/\/github\.com\/[\w-]+\/tiny-tools/g, repoUrl)
    .replace(/%40[\w.-]+%2Fcontext/g, `%40${scope}%2Fcontext`)
    .replace(/config=[A-Za-z0-9+\/=%]+/g, `config=${cursorB64}`)
    .replace(/https:\/\/insiders\.vscode\.dev\/redirect\?url=[^)\s]+/g, `https://insiders.vscode.dev/redirect?url=${vscodeUrl}`);
  if (after !== before) {
    await fs.writeFile(f, after);
    changed++;
  }
}
console.log(`owner set: github=${github} scope=@${scope} · ${pkgs.length} package.json + ${changed} other files updated`);
console.log("next: npm install (refresh the lockfile), npm test, git commit");
