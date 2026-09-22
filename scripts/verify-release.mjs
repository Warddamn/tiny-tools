#!/usr/bin/env node
// @author AVRG3
/** Check the documented public install, without local workspace packages or npm credentials. */
import { verifyContextSafety } from "./verify-safety.mjs";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await fs.readFile(path.join(root, "plugins/tiny-context/.mcp.json"), "utf8")).mcpServers["tiny-context"];
for (const rel of ["README.md", "packages/context/README.md"]) {
  const doc = await fs.readFile(path.join(root, rel), "utf8");
  assert.ok(doc.includes([config.command, ...config.args].join(" ")), `${rel}: install command drifted`);
  const cursor = doc.match(/install-mcp\?name=tiny-context&config=([^\s)]+)/)?.[1];
  assert.deepEqual(JSON.parse(Buffer.from(decodeURIComponent(cursor), "base64").toString()), config, `${rel}: Cursor badge drifted`);
  const vscode = new URL(decodeURIComponent(doc.match(/redirect\?url=([^\s)]+)/)?.[1]));
  assert.deepEqual(JSON.parse(decodeURIComponent(vscode.search.slice(1))), { name: "tiny-context", ...config }, `${rel}: VS Code badge drifted`);
  for (const block of doc.matchAll(/```json\n([\s\S]*?)```/g)) {
    const parsed = JSON.parse(block[1]);
    const server = (parsed.mcpServers ?? parsed.servers)?.["tiny-context"];
    if (server) assert.deepEqual({ command: server.command, args: server.args }, config, `${rel}: JSON config drifted`);
  }
}
console.log("PASS install commands, client configs and button payloads agree");
if(process.argv.includes('--check-docs')) process.exit(0);
const override=process.argv.indexOf('--package');
if(override>=0) { assert.ok(process.argv[override+1]); config.args[2]=path.resolve(process.argv[override+1]); }
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-release-"));
const fixtures = path.join(scratch, "fixtures");
const client = new Client({ name: "tiny-release-check", version: "0.1.0" });
let transport;
try {
  await fs.cp(path.join(root, "packages/context/test/fixtures"), fixtures, { recursive: true });
  await fs.writeFile(path.join(scratch, "user.npmrc"), "");
  await fs.writeFile(path.join(scratch, "global.npmrc"), "");
  transport = new StdioClientTransport({
    ...config, cwd: scratch, stderr: "pipe",
    env: {
      npm_config_cache: path.join(scratch, "cache"),
      npm_config_userconfig: path.join(scratch, "user.npmrc"),
      npm_config_globalconfig: path.join(scratch, "global.npmrc"),
      npm_config_registry: "https://registry.npmjs.org/",
      npm_config_audit: "false", npm_config_fund: "false",
    },
  });
  // Keep stderr flowing without echoing dependency diagnostics or credential-like strings.
  transport.stderr?.on("data", () => {});
  console.log("Downloading and connecting to public release (fresh cache, no npm login)…");
  await client.connect(transport, { timeout: 240_000 });
  const cases = [
    ["file_map", { path: path.join(fixtures, "sample.ts") }, /parseConfig/],
    ["query_file", { path: path.join(fixtures, "sample.pdf"), query: "termination" }, /#1 page 2/],
    ["read_section", { path: path.join(fixtures, "sample.md"), locator: { heading: "Parties" } }, /Acme Corp/],
    ["query_table", { path: path.join(fixtures, "sample.csv"), sql: "SELECT COUNT(*) AS n FROM t WHERE total < 0" }, /\| 2 \|/],
    ["summarize_log", { path: path.join(fixtures, "sample.log"), focus: "errors" }, /×8 ERROR/],
    ["diff_files", { a: path.join(fixtures, "a.md"), b: path.join(fixtures, "b.md") }, /1 changed section/],
    ["validate_file", { path: path.join(fixtures, "ragged.csv") }, /^FAIL ragged\.csv/],
    ["extract", { paths: [path.join(fixtures, "sample.json")], kind: "emails" }, /dana@example.com/],
  ];
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(t => t.name).sort(), cases.map(c => c[0]).sort());
  for (const [name, args, expected] of cases) {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
    assert.ok(!result.isError, `${name}: server returned an error`);
    assert.match(text, expected, `${name}: answer differs from fixture`);
    assert.match(text, /Returned ~[\d,]+ tokens/, `${name}: missing response ledger`);
    console.log(`PASS ${name}`);
  }
  await verifyContextSafety(client,fixtures);
  console.log("Public release verified: eight tools, eight expected results. This is an automated download, not evidence of a new user.");
} finally {
  await client.close();
  await transport?.close();
  await fs.rm(scratch, { recursive: true, force: true });
}
