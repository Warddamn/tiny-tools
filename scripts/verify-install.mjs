#!/usr/bin/env node
// @author AVRG3
/**
 * Proves the publish path before publishing: packs @tinytools/shared + @tinytools/context exactly as npm would,
 * installs the tarballs into a throwaway project (with an override so context resolves shared from the local
 * tarball), then — as a stranger would — runs `tiny-context --help`, drives `tiny-context-mcp` over stdio with the
 * official MCP client (listTools + one callTool), and feeds the Read guard hook a simulated Read.
 *   node scripts/verify-install.mjs        (exit 0 = every step passed)
 */
import { execFileSync, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-verify-"));
const step = (name) => process.stdout.write(`  ${name.padEnd(46)}`);
const ok = (extra = "") => console.log(`ok ${extra}`);
const fail = (msg) => {
  console.log(`FAIL\n${msg}`);
  process.exit(1);
};
const npm = (args, cwd) => execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });

console.log(`verify-install → ${scratch}`);

step("build");
npm(["run", "build", "--silent"], ROOT);
ok();

step("pack shared + context");
const packed = JSON.parse(npm(["pack", "-w", "packages/shared", "-w", "packages/context", "--json", "--pack-destination", scratch, "--silent"], ROOT));
const tarballs = Object.fromEntries(packed.map((p) => [p.name, path.join(scratch, p.filename)]));
const sharedName = Object.keys(tarballs).find((n) => n.endsWith("/shared"));
const contextName = Object.keys(tarballs).find((n) => n.endsWith("/context"));
if (!sharedName || !contextName) fail(`unexpected pack output: ${JSON.stringify(packed.map((p) => p.name))}`);
ok(`${packed.map((p) => `${p.name} ${(p.size / 1024).toFixed(0)} KB`).join(" · ")}`);

step("install tarballs into a fresh project");
const proj = path.join(scratch, "stranger");
await fs.mkdir(proj, { recursive: true });
await fs.writeFile(
  path.join(proj, "package.json"),
  JSON.stringify({ name: "stranger", private: true, type: "module", overrides: { [sharedName]: `file:${tarballs[sharedName]}` } }, null, 2),
);
try {
  // only the context tarball is a direct dependency; the override resolves its @…/shared dependency to the local tarball
  npm(["install", "--no-audit", "--no-fund", "--loglevel=error", tarballs[contextName]], proj);
} catch (e) {
  fail(`npm install failed (registry down for maintenance?):\n${String(e.stderr ?? e.message).slice(-800)}`);
}
ok();

step("bins exist and are executable");
const bins = ["tiny-context", "tiny-context-mcp", "tiny-context-read-guard"].map((b) => path.join(proj, "node_modules", ".bin", b));
for (const b of bins) {
  try {
    await fs.access(b, (await import("node:fs")).constants.X_OK);
  } catch {
    fail(`missing or not executable: ${b}`);
  }
}
ok();

step("tiny-context --help / tools");
const help = spawnSync(bins[0], ["--help"], { encoding: "utf8" });
if (help.status !== 0 || !/read_section|read <path>/.test(help.stdout)) fail(`--help exit ${help.status}\n${help.stdout}\n${help.stderr}`);
const tools = spawnSync(bins[0], ["tools"], { encoding: "utf8" });
if (tools.status !== 0 || tools.stdout.split("\n").filter(Boolean).length !== 8) fail(`tools exit ${tools.status}\n${tools.stdout}\n${tools.stderr}`);
ok();

step("tiny-context map on the installed README");
const readme = path.join(proj, "node_modules", contextName, "README.md");
const map = spawnSync(bins[0], ["map", readme], { encoding: "utf8" });
if (map.status !== 0 || !/Returned ~[\d,]+ tokens/.test(map.stdout)) fail(`map exit ${map.status}\n${map.stdout}\n${map.stderr}`);
ok();

step("MCP client → tiny-context-mcp over stdio");
const client = `
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const client = new Client({ name: "stranger", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: process.argv[2], args: [] }));
const { tools } = await client.listTools();
const r = await client.callTool({ name: "file_map", arguments: { path: process.argv[3] } });
await client.close();
console.log(JSON.stringify({ tools: tools.map(t => t.name).sort(), text: r.content[0].text.slice(0, 200), isError: !!r.isError }));
`;
await fs.writeFile(path.join(proj, "client.mjs"), client);
const mcp = spawnSync(process.execPath, [path.join(proj, "client.mjs"), bins[1], readme], { cwd: proj, encoding: "utf8", timeout: 60_000 });
if (mcp.status !== 0) fail(`client exit ${mcp.status}\n${mcp.stdout}\n${mcp.stderr}`);
const parsed = JSON.parse(mcp.stdout.trim().split("\n").pop());
if (parsed.tools.length !== 8 || parsed.isError || !/README\.md — markdown/.test(parsed.text)) fail(`unexpected MCP result: ${mcp.stdout}`);
ok(`${parsed.tools.length} tools`);

step("Read guard hook denies a PDF Read");
const pdf = path.join(ROOT, "packages", "context", "test", "fixtures", "sample.pdf");
const hook = spawnSync(bins[2], [], { input: JSON.stringify({ tool_name: "Read", tool_input: { file_path: pdf } }), encoding: "utf8" });
if (hook.status !== 0 || !/"permissionDecision":"deny"/.test(hook.stdout)) fail(`hook exit ${hook.status}\n${hook.stdout}\n${hook.stderr}`);
ok();

await fs.rm(scratch, { recursive: true, force: true });
console.log("install path verified — a stranger's `npx`/`npm install` of these tarballs works end to end.");
