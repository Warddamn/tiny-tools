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

/** Loaded at session start by clients with tool search (Claude Code loads only tool names + this string; 2 KB cap). */
const INSTRUCTIONS =
  "tiny-context: know things about files without reading them. Use these tools BEFORE reading any file over ~20 KB and for EVERY PDF, DOCX, PPTX, XLSX (built-in Read cannot open them): " +
  "file_map (outline: headings, code signatures, sheets/columns, slide titles, pages, folder tree) · query_file (ranked passages with locations) · " +
  "read_section (only a heading/page/line/paragraph/sheet-range/slide) · query_table (DuckDB SQL over CSV/TSV/XLSX/Parquet/JSON, table t) · " +
  "summarize_log (clusters + timeline of a log) · diff_files (what changed, incl. office files and tables) · validate_file (JSON/YAML/XML/CSV/schema/links/encoding) · " +
  "extract (regex, emails/urls/dates/numbers, jq). Search for these tools when the task mentions: PDF, Word, Excel, PowerPoint, spreadsheet, CSV, Parquet, logs, errors/5xx, diff/compare, validate, large file, token budget. " +
  "Every response is bounded and ends with a savings line. Small plain-text files: just Read them.";

const server = new McpServer({ name: "tiny-context", version }, { instructions: INSTRUCTIONS });

for (const t of TOOLS) {
  server.registerTool(
    t.name,
    {
      title: t.title,
      description: t.description,
      inputSchema: t.schema.shape,
      annotations: { readOnlyHint: !t.writes, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      // Claude Code tool search: keep the gateway tool always visible; the other seven load on demand.
      ...(t.name === "file_map" ? { _meta: { "anthropic/alwaysLoad": true } } : {}),
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
