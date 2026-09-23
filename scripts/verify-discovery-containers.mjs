#!/usr/bin/env node
// @author AVRG3
/** Test both directory-inspection images over the same MCP interface a client uses. */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-discovery-'));
const catalog = JSON.parse(await fs.readFile(path.join(root, 'discovery/catalog.json'), 'utf8'));
try {
  await fs.chmod(dir, 0o755);
  await fs.writeFile(path.join(dir, 'sales.csv'), 'region,amount\nNorth,10\nNorth,20\nSouth,5\n');
  await fs.writeFile(path.join(dir, 'note.md'), '# Returns\nReturns are accepted for 30 days. Contact team@example.test.\n');
  await fs.writeFile(path.join(dir, 'note-v2.md'), '# Returns\nReturns are accepted for 60 days.\n');
  await fs.writeFile(path.join(dir, 'data.json'), '{"ok":true}\n');
  await fs.writeFile(path.join(dir, 'app.log'), '2026-01-01T00:00:00Z ERROR request 12 failed\n2026-01-01T00:00:01Z ERROR request 13 failed\n');
  await fs.cp(path.join(root, 'packages/runtime/examples'), path.join(dir, 'runtime'), { recursive: true });
  for (const [key, cases] of [
    ['context', [
      ['file_map', { path: '/fixtures/note.md' }, /Returns/],
      ['query_file', { path: '/fixtures/note.md', query: 'Returns' }, /30 days/],
      ['read_section', { path: '/fixtures/note.md', locator: { lines: '1-2' } }, /30 days/],
      ['query_table', { path: '/fixtures/sales.csv', sql: 'SELECT SUM(amount) AS total FROM t' }, /35/],
      ['summarize_log', { path: '/fixtures/app.log' }, /failed/],
      ['diff_files', { a: '/fixtures/note.md', b: '/fixtures/note-v2.md' }, /30|60/],
      ['validate_file', { path: '/fixtures/data.json' }, /PASS/],
      ['extract', { path: '/fixtures/note.md', kind: 'emails' }, /team@example\.test/],
    ]],
    ['runtime', [
      ['collect_pages', { config: '/fixtures/runtime/collect.json', output_dir: '/tmp' }, /"status": "complete"/],
      ['check_progress', { path: '/fixtures/runtime/guard-trace.json', output_dir: '/tmp' }, /"action": "block"/],
      ['plan_cache', { path: '/fixtures/runtime/progress-trace.json', output_dir: '/tmp' }, /"mode": "advisory_only"/],
    ]],
  ]) {
    const client = new Client({ name: 'directory-build-check', version: '1.0.0' });
    try {
      await client.connect(new StdioClientTransport({ command: 'docker', args: ['run', '--rm', '-i', '--network=none', '--read-only', '--tmpfs', '/tmp:rw,nosuid,size=256m', '--mount', `type=bind,source=${dir},target=/fixtures,readonly`, `tiny-${key}-inspection`], stderr: 'inherit' }));
      const discovered = (await client.listTools()).tools;
      const expectedServer = catalog.servers.find(s => s.name === `tiny-${key}`);
      assert.deepEqual(discovered.sort((a, b) => a.name.localeCompare(b.name)), expectedServer.tools);
      assert.equal(client.getInstructions(), expectedServer.instructions);
      assert.equal(client.getServerVersion().version, expectedServer.version);
      for (const [name, args, expected] of cases) {
        const result = await client.callTool({ name, arguments: args });
        assert.ok(!result.isError, `${name}: ${JSON.stringify(result)}`);
        const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        assert.match(text, expected);
        assert.ok(Buffer.byteLength(text) < 16_384);
        console.log(`PASS ${key}/${name}: non-root, read-only image, read-only inputs, network disabled`);
      }
    } finally { await client.close(); }
  }
} finally { await fs.rm(dir, { recursive: true, force: true }); }
