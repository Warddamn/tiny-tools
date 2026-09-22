#!/usr/bin/env node
// @author AVRG3
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS, DESCRIPTIONS, runTool } from './tools.js';
const server = new McpServer({ name: 'tiny-runtime', version: '0.1.0' }, { instructions: 'tiny-runtime offers three deterministic helpers: collect_pages to finish paginated jobs with complete/partial/failed status and local checkpoints; check_progress to analyze repeat failures against trusted state fingerprints; plan_cache for serving-engine developers to derive advisory scheduling hints. Configs and traces are local JSON files. Prefer built-ins for one small request, a short obvious error, or ordinary hosted-model usage. Use the SDK wrappers for automatic guard enforcement and live progress delivery. Partial collection is never a complete answer; resume its checkpoint. No telemetry or LLM calls.' });
for (const tool of TOOLS) server.registerTool(tool.name, { title: tool.title, description: DESCRIPTIONS[tool.name], inputSchema: tool.schema.shape, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: tool.openWorld } }, async (args: unknown, extra) => {
  const progressToken = extra._meta?.progressToken;
  const result = await runTool(tool.name, args, {
    signal: extra.signal,
    onProgress: progressToken === undefined ? undefined : async ({ pages, records }) => {
      await extra.sendNotification({ method: 'notifications/progress', params: { progressToken, progress: pages, message: `${pages} pages committed; ${records} records collected` } }).catch(() => {});
    },
  });
  return { ...(result.ok ? {} : { isError: true }), content: [{ type: 'text' as const, text: result.text }] };
});
await server.connect(new StdioServerTransport());
