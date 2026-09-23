#!/usr/bin/env node
// @author AVRG3
/** Publish the actual MCP tool schemas without downloading or invoking release archives. */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = 'https://github.com/Warddamn/tiny-tools';
const profiles = [
  { key: 'context', expected: 8, tasks: ['search PDF Word PowerPoint documents', 'SQL query CSV Excel Parquet', 'summarize repeated log errors', 'compare document versions', 'validate structured files', 'extract emails URLs IDs'] },
  { key: 'runtime', expected: 3, tasks: ['resume cursor API pagination', 'checkpoint batch collection', 'detect repeated agent failures and retry loops', 'derive tool-progress cache hints for serving engines'] },
];
const catalog = { schemaVersion: 1, format: 'tiny-tools project catalog; not an automatic-install protocol', author: 'AVRG3', repository: repo, documentation: `${repo}/blob/main/discovery/README.md`, servers: [] };
const config = { mcpServers: {} };
for (const profile of profiles) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'packages', profile.key, 'package.json'), 'utf8'));
  const registry = JSON.parse(await fs.readFile(path.join(root, 'packages', profile.key, 'server.json'), 'utf8'));
  const client = new Client({ name: 'tiny-tools-catalog', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'packages', profile.key, 'dist', 'mcp.js')], stderr: 'pipe' }));
    const { tools } = await client.listTools();
    assert.equal(tools.length, profile.expected);
    assert.equal(client.getServerVersion().version, manifest.version);
    assert.equal(registry.version, manifest.version, 'Registry metadata and package version must agree');
    assert.ok(client.getInstructions(), 'Server instructions must be discoverable');
    assert.ok(tools.every(tool => tool.description && tool.inputSchema?.type === 'object'));
    const server = `tiny-${profile.key}`;
    const filename = profile.key === 'context' ? `tiny-context-standalone-${manifest.version}.tgz` : `tiny-runtime-${manifest.version}.tgz`;
    const install = { command: 'npx', args: ['-y', '-p', `${repo}/releases/download/${profile.key}-v${manifest.version}/${filename}`, `${server}-mcp`] };
    config.mcpServers[server] = install;
    catalog.servers.push({ name: server, version: manifest.version, registryName: registry.name, description: manifest.description,
      tasks: profile.tasks, requirements: 'Node.js 20+; client must explicitly connect this local stdio server; first install downloads dependencies',
      install, documentation: `${repo}/tree/main/packages/${profile.key}#readme`,
      instructions: client.getInstructions(), tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
    });
  } finally { await client.close(); }
}
for (const [name, data] of [['catalog.json', catalog], ['mcp.json', config]]) {
  const file = path.join(root, 'discovery', name);
  const rendered = `${JSON.stringify(data, null, 2)}\n`;
  if (process.argv.includes('--check')) assert.equal(await fs.readFile(file, 'utf8'), rendered, `${name} is stale: run npm run discovery:catalog`);
  else { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, rendered); }
}
console.log('Verified catalog: tiny-context (8 tools), tiny-runtime (3 tools), pinned install config; no public downloads.');
