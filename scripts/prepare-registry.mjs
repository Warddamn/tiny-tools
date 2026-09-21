#!/usr/bin/env node
// @author AVRG3
/** Turn checked bundle artifacts into the exact metadata to publish. */
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
const dir = path.resolve(process.argv[2] ?? ".tmp/mcpb");
const base = JSON.parse(await fs.readFile("packages/context/server.json", "utf8"));
const version = JSON.parse(await fs.readFile("packages/context/package.json", "utf8")).version;
assert.match(version, /^\d+\.\d+\.\d+$/);
const packages = [];
for (const platform of ["darwin", "linux", "win32"]) {
  const name = `tiny-context-${version}-${platform}.mcpb`;
  const details = JSON.parse(await fs.readFile(path.join(dir, `${name}.json`), "utf8"));
  const hash = createHash("sha256").update(await fs.readFile(path.join(dir, name))).digest("hex");
  assert.equal(details.sha256, hash);
  assert.equal(details.platform, platform);
  assert.equal(details.version, version);
  packages.push({ registryType: "mcpb", identifier: `https://github.com/Warddamn/tiny-tools/releases/download/context-v${version}/${name}`, fileSha256: hash, transport: { type: "stdio" } });
}
const server = { ...base, version, packages };
assert.ok(server.description.length <= 100);
await fs.writeFile(path.join(dir, "server.json"), JSON.stringify(server, null, 2) + "\n");
console.log(`Prepared ${server.name}@${version}: three verified bundles`);
