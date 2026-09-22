#!/usr/bin/env node
/**
 * @author AVRG3
 * tiny-context CLI — thin commander wrapper over the same zod schemas + lib as the MCP server.
 * Exit codes: 0 ok · 1 error (message on stderr).
 */
import { createRequire } from "node:module";
import { Command, InvalidArgumentError } from "commander";
import { formatError } from "@tiny_tools_pw/shared";
import { TOOLS, runTool } from "./tools.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const int = (v: string): number => {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new InvalidArgumentError("expected a whole number");
  return n;
};

async function run(name: string, args: Record<string, unknown>): Promise<void> {
  try {
    const text = await runTool(name, args);
    process.stdout.write(`${text}\n`);
  } catch (e) {
    process.stderr.write(`${formatError(e)}\n`);
    process.exitCode = 1;
  }
}

const program = new Command()
  .name("tiny-context")
  .description("Know things about files without reading them: outline, search, slice, SQL, log clusters, diffs, validation, extraction. Same tools as the tiny-context MCP server.")
  .version(version);

program
  .command("map")
  .argument("<path>", "file or directory")
  .option("-d, --depth <n>", "directory depth (default 2, max 8)", int)
  .description("Structural outline of a file or directory (file_map)")
  .action((path: string, o: { depth?: number }) => run("file_map", { path, depth: o.depth }));

program
  .command("query")
  .argument("<path>", "file or glob (repeat with --also for more)")
  .argument("<query>", "words, a phrase, or a regex with --regex")
  .option("-a, --also <paths...>", "more files/globs to search together")
  .option("-r, --regex", "treat the query as a regular expression")
  .option("-n, --max-results <n>", "passages returned (default 8, cap 30)", int)
  .option("-c, --context-lines <n>", "context lines per hit (default 2)", int)
  .description("Ranked passages matching a query, with locations (query_file)")
  .action((path: string, query: string, o: { also?: string[]; regex?: boolean; maxResults?: number; contextLines?: number }) =>
    run("query_file", { paths: [path, ...(o.also ?? [])], query, regex: o.regex, max_results: o.maxResults, context_lines: o.contextLines }),
  );

program
  .command("read")
  .argument("<path>", "file")
  .option("--heading <text>", "heading to read (md/docx)")
  .option("--pages <range>", "pages, e.g. 3-5 (pdf)")
  .option("--lines <range>", "lines, e.g. 120-180 (text/code)")
  .option("--paras <range>", "paragraphs, e.g. 88-95 (docx)")
  .option("--sheet <name>", "sheet name (xlsx)")
  .option("--range <ref>", "cell/row range within --sheet, e.g. A1:F20 or 10-40")
  .option("--slide <n>", "slide number or range (pptx)")
  .option("-t, --max-tokens <n>", "cap on returned text (default 2000, max 8000)", int)
  .description("Read only the located section of a file (read_section)")
  .action((path: string, o: Record<string, string | number | undefined>) =>
    run("read_section", {
      path,
      locator: { heading: o["heading"], pages: o["pages"], lines: o["lines"], paras: o["paras"], sheet: o["sheet"], range: o["range"], slide: o["slide"] },
      max_tokens: o["maxTokens"],
    }),
  );

program
  .command("table")
  .argument("<path>", "csv/tsv/parquet/xlsx/json file (table `t`)")
  .argument("<sql>", "DuckDB SQL, e.g. \"SELECT region, SUM(total) FROM t GROUP BY 1\"")
  .option("-n, --max-rows <n>", "rows returned (default 50, cap 200)", int)
  .option("-o, --out <path>", "write the full result to this CSV")
  .option("-s, --sheet <name>", "xlsx sheet (default: first)")
  .option("--timeout-ms <n>", "SQL worker deadline (default 15000, max 60000)", int)
  .description("Run one read-only SQL query over a table file (query_table)")
  .action((path: string, sql: string, o: { maxRows?: number; out?: string; sheet?: string; timeoutMs?: number }) => run("query_table", { path, sql, max_rows: o.maxRows, out: o.out, sheet: o.sheet, timeout_ms: o.timeoutMs }));

program
  .command("log")
  .argument("<path>", "log file")
  .option("-f, --focus <what>", "'errors', 'warnings', or a keyword/regex")
  .option("--since <when>", "ISO timestamp or relative span like 2h")
  .option("-n, --max-clusters <n>", "clusters returned (default 15, max 50)", int)
  .description("Cluster a log file into templates with counts + timeline (summarize_log)")
  .action((path: string, o: { focus?: string; since?: string; maxClusters?: number }) => run("summarize_log", { path, focus: o.focus, since: o.since, max_clusters: o.maxClusters }));

program
  .command("diff")
  .argument("<a>", "before")
  .argument("<b>", "after")
  .option("-m, --mode <mode>", "summary (default) or unified")
  .option("-n, --max-hunks <n>", "hunks reported (default 20, max 100)", int)
  .description("What changed between two files, incl. pdf/docx/xlsx/csv (diff_files)")
  .action((a: string, b: string, o: { mode?: string; maxHunks?: number }) => run("diff_files", { a, b, mode: o.mode, max_hunks: o.maxHunks }));

program
  .command("validate")
  .argument("<path>", "json/yaml/xml/csv/md/html file")
  .option("-s, --schema <path>", "JSON Schema to validate against")
  .description("Deterministic checks: syntax, CSV shape, JSON Schema, links, encoding (validate_file)")
  .action((path: string, o: { schema?: string }) => run("validate_file", { path, schema: o.schema }));

program
  .command("extract")
  .argument("<paths...>", "files or globs")
  .option("-p, --pattern <regex>", "regex (first capture group is returned)")
  .option("-i, --ignore-case", "case-insensitive pattern")
  .option("-j, --jq <filter>", "jq filter for JSON files")
  .option("-k, --kind <kind>", "emails | urls | dates | numbers")
  .option("-n, --max-matches <n>", "matches returned (default 100, cap 500)", int)
  .option("--no-dedupe", "list every match instead of unique values with counts")
  .description("Pull matches/values out of files with locations (extract)")
  .action((paths: string[], o: { pattern?: string; ignoreCase?: boolean; jq?: string; kind?: string; maxMatches?: number; dedupe?: boolean }) =>
    run("extract", { paths, pattern: o.pattern, ignore_case: o.ignoreCase, jq: o.jq, kind: o.kind, max_matches: o.maxMatches, dedupe: o.dedupe }),
  );

program
  .command("tools")
  .description("List the MCP tools this CLI mirrors")
  .action(() => {
    for (const t of TOOLS) process.stdout.write(`${t.name.padEnd(14)} ${t.description.split("\n")[0]}\n`);
  });

await program.parseAsync(process.argv);
