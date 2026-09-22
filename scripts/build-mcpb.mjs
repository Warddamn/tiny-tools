#!/usr/bin/env node
// @author AVRG3
/** Build an OS-specific, self-contained MCP bundle from locked production dependencies. */
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.platform;
assert.ok(["darwin", "linux", "win32"].includes(platform), "Unsupported bundle platform");
const out = path.resolve(process.argv[2] ?? path.join(root, ".tmp/mcpb"));
await fs.mkdir(out, { recursive: true });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-mcpb-build-"));
const mirror = path.join(temp, "install");
const stage = path.join(temp, "bundle");
const lock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
const pkg = JSON.parse(await fs.readFile(path.join(root, "packages/context/package.json"), "utf8"));
const entry = `node_modules/${pkg.name}/dist/mcp.js`;
const npmPath = process.env.npm_execpath;
assert.ok(npmPath, "Run with npm run bundle:mcpb");
const npm = args => execFileSync(process.execPath, [npmPath, ...args], {
  cwd: mirror, env: { ...process.env, npm_config_userconfig: path.join(temp, "user.npmrc"), npm_config_globalconfig: path.join(temp, "global.npmrc"), npm_config_registry: "https://registry.npmjs.org/" },
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024,
});
try {
  await fs.mkdir(mirror);
  await fs.mkdir(stage);
  await fs.writeFile(path.join(temp, "user.npmrc"), "");
  await fs.writeFile(path.join(temp, "global.npmrc"), "");
  for (const rel of ["package.json", "package-lock.json", "packages/context/package.json", "packages/shared/package.json", "packages/runtime/package.json", "bench/package.json", "evals/package.json"]) {
    await fs.mkdir(path.dirname(path.join(mirror, rel)), { recursive: true });
    await fs.copyFile(path.join(root, rel), path.join(mirror, rel));
  }
  for (const name of ["context", "shared"]) {
    const manifest = JSON.parse(await fs.readFile(path.join(root, `packages/${name}/package.json`), "utf8"));
    for (const rel of manifest.files) {
      await fs.cp(path.join(root, `packages/${name}`, rel), path.join(mirror, `packages/${name}`, rel), { recursive: true });
    }
    await fs.copyFile(path.join(root, "LICENSE"), path.join(mirror, `packages/${name}/LICENSE`));
  }
  console.log(`Install locked production dependencies for ${platform}`);
  npm(["ci", "--omit=dev", "--include=optional", "--ignore-scripts", "--workspace=packages/context", "--include-workspace-root=false", "--no-audit", "--no-fund"]);
  // Dereference only our workspace packages. No developer files or credential files enter the bundle.
  await fs.cp(path.join(mirror, "node_modules"), path.join(stage, "node_modules"), {
    recursive: true, dereference: true,
    filter: src => ![".bin", ".package-lock.json"].includes(path.basename(src)) && !/[\\/]@tiny_tools_pw[\\/](bench|evals)([\\/]|$)/.test(src),
  });
  // Each OS bundle includes the x64 and arm64 bindings, so the manifest can accurately claim OS compatibility.
  const bindings = Object.entries(lock.packages).filter(([name, info]) => name.startsWith(`node_modules/@duckdb/node-bindings-${platform}-`) && info.os?.includes(platform));
  assert.ok(bindings.length >= 2, "Missing locked native dependencies");
  for (const [relative, info] of bindings) {
    const dest = path.join(stage, relative);
    try { await fs.access(path.join(dest, "package.json")); continue; } catch { /* fetch the other architecture */ }
    const response = await fetch(info.resolved, { signal: AbortSignal.timeout(120_000) });
    assert.ok(response.ok, `Cannot download ${relative}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const [algorithm, digest] = info.integrity.split("-");
    assert.equal(createHash(algorithm).update(bytes).digest("base64"), digest, `Integrity mismatch: ${relative}`);
    const tarball = path.join(temp, "native.tgz");
    await fs.writeFile(tarball, bytes);
    await fs.mkdir(dest, { recursive: true });
    execFileSync("tar", ["-xzf", tarball, "-C", dest, "--strip-components=1"]);
  }
  const tools = (await import(pathToFileURL(path.join(root, "packages/context/dist/tools.js")).href)).TOOLS;
  const manifest = {
    manifest_version: "0.3", name: "tiny-context", display_name: "tiny-context — efficient file tasks",
    version: pkg.version,
    description: "Query tables, find document passages and summarize logs with bounded results for AI agents.",
    long_description: "Eight local tools by AVRG3 for file tasks with fewer reading steps. Query CSV/XLSX/Parquet with SQL; find PDF/Office passages; cluster recurring log errors; compare, validate and extract. Task-level comparisons include both improvements and regressions; short text and exact-string searches may be better served by built-ins. This bundle includes production dependencies and DuckDB for x64/arm64 on its declared OS. Requires Node.js 20+ (or a compatible host-provided runtime). No account or telemetry. Returned text is passed to your agent client and may be sent to its model provider.",
    author: { name: "AVRG3", url: "https://github.com/Warddamn" },
    repository: { type: "git", url: "https://github.com/Warddamn/tiny-tools" },
    homepage: "https://github.com/Warddamn/tiny-tools",
    documentation: "https://github.com/Warddamn/tiny-tools/blob/main/QUICKSTART.md",
    support: "https://github.com/Warddamn/tiny-tools/issues",
    license: "MIT", keywords: ["agent-efficiency", "token-savings", "context-window", "log-analysis", "csv", "sql", "pdf", "document-search", "local-first"],
    compatibility: { platforms: [platform], runtimes: { node: ">=20" } },
    server: { type: "node", entry_point: entry, mcp_config: { command: "node", args: [`\${__dirname}/${entry}`] } },
    tools: tools.map(t => ({ name: t.name, description: t.description })),
  };
  await fs.writeFile(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await fs.copyFile(path.join(root, "LICENSE"), path.join(stage, "LICENSE"));
  await fs.copyFile(path.join(root, "QUICKSTART.md"), path.join(stage, "README.md"));
  const filename = `tiny-context-${pkg.version}-${platform}.mcpb`;
  const artifact = path.join(out, filename);
  console.log(npm(["exec", "--yes", "--package=@anthropic-ai/mcpb@2.1.2", "--", "mcpb", "pack", stage, artifact]).split("\n").slice(-8).join("\n"));
  const hash = createHash("sha256").update(await fs.readFile(artifact)).digest("hex");
  const details = { filename, sha256: hash, platform, version: pkg.version, bytes: (await fs.stat(artifact)).size, nativePackages: bindings.map(([name]) => name.replace("node_modules/", "")) };
  await fs.writeFile(path.join(out, `${filename}.json`), JSON.stringify(details, null, 2) + "\n");
  console.log(JSON.stringify(details));
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
