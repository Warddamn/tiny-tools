#!/usr/bin/env node
// @author AVRG3
/** Extract the exact archive away from the repo, then check all tools through its manifest command. */
import { verifyContextSafety } from "./verify-safety.mjs";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.ok(process.argv[2], "Pass the .mcpb archive to verify");
const archive = path.resolve(process.argv[2]);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-mcpb-test-"));
const bundle = path.join(temp, "bundle");
const fixtures = path.join(temp, "fixtures");
const client = new Client({ name: "tiny-mcpb-verifier", version: "0.1.0" });
try {
  execFileSync(process.platform === "win32" ? "python" : "python3", ["-c", `
import sys, zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as z:
    target = Path(sys.argv[2]).resolve()
    for name in z.namelist():
        if not (target / name).resolve().is_relative_to(target):
            raise ValueError('Unsafe archive path')
    z.extractall(target)
`, archive, bundle]);
  const manifest = JSON.parse(await fs.readFile(path.join(bundle, "manifest.json"), "utf8"));
  assert.ok(manifest.compatibility.platforms.includes(process.platform));
  assert.equal(manifest.author.name, "AVRG3");
  assert.equal(manifest.server.mcp_config.command, "node");
  await fs.access(path.join(bundle, manifest.server.entry_point));
  await fs.cp(path.join(root, "packages/context/test/fixtures"), fixtures, { recursive: true });
  const args = manifest.server.mcp_config.args.map(arg => arg.replaceAll("${__dirname}", bundle));
  const transport = new StdioClientTransport({ command: process.execPath, args, cwd: temp, stderr: "pipe", env: { PATH: "", NODE_PATH: "" } });
  transport.stderr?.on("data", () => {});
  await client.connect(transport);
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
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(t => t.name).sort(), manifest.tools.map(t => t.name).sort());
  assert.deepEqual(tools.map(t => t.name).sort(), cases.map(c => c[0]).sort());
  for (const [name, args, expected] of cases) {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
    assert.ok(!result.isError, `${name} returned an error`);
    assert.match(text, expected);
    assert.match(text, /Returned ~[\d,]+ tokens/);
    console.log(`PASS ${name}`);
  }
  await verifyContextSafety(client,fixtures);
  // Exercise the spreadsheet conversion path too, since it must not download a DuckDB extension.
  const spreadsheet = await client.callTool({ name: "query_table", arguments: { path: path.join(fixtures, "sample.xlsx"), sql: "SELECT COUNT(*) AS n FROM t" } });
  assert.ok(!spreadsheet.isError, "Bundled XLSX query failed");
  console.log(`PASS ${path.basename(archive)}: eight tools + XLSX, launched outside repo without npm on PATH`);
} finally {
  await client.close();
  await fs.rm(temp, { recursive: true, force: true });
}
