#!/usr/bin/env node
/**
 * @author AVRG3
 * tiny-context MCP server (stdio). Handlers contain no logic: validate (zod) → lib → format.
 * stdout is the protocol channel — log to stderr only.
 */
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatError, toolError } from "@tinytools/shared";
import { TOOLS, runTool } from "./tools.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
const debug = process.env["TINY_TOOLS_DEBUG"] === "1";
const log = (msg: string): void => {
  process.stderr.write(`[tiny-context] ${msg}\n`);
};

const server = new McpServer({ name: "tiny-context", version });

for (const t of TOOLS) {
  server.registerTool(
    t.name,
    {
      title: t.title,
      description: t.description,
      inputSchema: t.schema.shape,
      annotations: { readOnlyHint: !t.writes, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args: unknown) => {
      const t0 = Date.now();
      try {
        const text = await runTool(t.name, args);
        if (debug) log(`${t.name} ok ${Date.now() - t0}ms ${text.length}B`);
        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        if (debug) log(`${t.name} error ${Date.now() - t0}ms: ${formatError(e)}`);
        return toolError(e);
      }
    },
  );
}

process.on("uncaughtException", (e) => log(`uncaught: ${formatError(e)}`));
process.on("unhandledRejection", (e) => log(`unhandled: ${formatError(e)}`));

await server.connect(new StdioServerTransport());
if (debug) log(`ready · ${TOOLS.length} tools · v${version}`);
