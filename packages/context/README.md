# @tinytools/context — `tiny-context`

**Know things about files without reading them.** Eight local, deterministic tools that let an AI agent outline, search, slice, query, cluster, diff, validate and extract from files — including PDF, DOCX, PPTX and XLSX — and get back only what it needs, with a savings line on every response.

```json
{ "mcpServers": { "tiny-context": { "command": "npx", "args": ["-y", "@tinytools/context", "tiny-context-mcp"] } } }
```

## What it replaces

Whole-file `Read`/`cat` calls that mattered for one turn; `ls`+`grep`+`head` loops to learn what a folder holds; scripts written just to sum a column; `tail`/`grep` loops over logs; opening PDFs and Office files that built-in tools can't read at all.

## Why

~50% of a typical agent's context window is tool results, dominated by whole-file reads that mattered for one turn; agent workloads are read/review-heavy (~59% checking vs ~9% writing in published measurements); keeping intermediate data out of context has shown up-to-98% token reductions. These tools let an agent *know things about files without reading them*. Every response is bounded and ends with a savings line.

Reducing tokens-per-step and wall-clock-per-step is what lets an agent take more steps before its context degrades — a capability multiplier, not just a cost saving.

## Benchmarks

<!-- bench:start -->
_Run `npm run bench` to generate. See `bench/RESULTS.md`._
<!-- bench:end -->

Measured the way an agent would experience it: **naive** = tokens to read the raw content the task needs (bytes/4); **tool** = tokens of the tool's full response. Fixtures are generated locally by `bench/`.

## Size

<!-- size:start -->
_Computed by `npm run bench`._
<!-- size:end -->

Dependencies and why each one earns its place:

| Dependency | Why | Loaded |
|---|---|---|
| `@modelcontextprotocol/sdk` | the official MCP server/client (stdio) | at start |
| `zod` | one schema drives lib, CLI and MCP; param descriptions live here | at start |
| `commander` | the CLI | CLI only |
| `@tinytools/shared` | path/glob resolution, safe outputs, teach-errors, ledger, text extraction (pdf via `unpdf`, office via `fflate` + regex) | at start; `unpdf` lazily |
| `@duckdb/node-api` *(optional, native)* | SQL over CSV/TSV/Parquet/XLSX in `query_table` | lazily, only for `query_table` |
| `ajv` · `yaml` · `fast-xml-parser` | JSON Schema · YAML · XML checks in `validate_file` | lazily, per check |

No models, no binaries, no network. `extract` uses system `jq` when present and a built-in path subset otherwise.

## Tools

| Tool | One line | Beats the built-in because |
|---|---|---|
| `file_map` | Outline of a file/dir without contents: headings, signatures, sheets/columns, slide titles, pages, size tree | one call replaces ls+grep+head loops; opens office/PDF formats |
| `query_file` | Ranked passages (BM25 + exact-phrase boost, or regex) across many files with exact locations | Grep can't search PDF/office files or rank across files; the follow-up read is surgical |
| `read_section` | Only the located part: heading section, page range, line range, ¶ range, sheet range, slide | Read can't slice a PDF/DOCX/XLSX/PPTX; pairs with `file_map`/`query_file` |
| `query_table` | DuckDB SQL over CSV/TSV/Parquet/XLSX (table `t`), total rows reported, full result to CSV via `out` | aggregates without the data entering context; no script writing |
| `summarize_log` | Template clusters with counts, first/last time, one sample each; level counts; rate timeline | 80k lines → ~300 tokens; grep loops can't see structure |
| `diff_files` | Changed sections with locations and ± counts; table row add/remove/change counts; capped unified diff | works outside git and on office formats; summary is ~100 tokens |
| `validate_file` | JSON/YAML/XML parse · CSV shape · JSON Schema · Markdown/HTML internal links · encoding/BOM | one call, no linter setup; deterministic checks you don't re-read for |
| `extract` | Regex / built-in kinds (emails, urls, dates, numbers) / jq values with locations and counts | Grep can't open office/PDF; dedupe + kinds + jq in one place |

Every response: headline · bounded payload (≤ ~4,000 tokens) · caveats (caps hit, files skipped) · `Returned ~214 tokens · raw ≈ 48,200 tokens · 99.6% saved · 0.4s`.

Every error says what went wrong **and** what to do next (`Input not found: … — accepts absolute paths and globs like './shots/*.png'`; SQL errors include the table's columns and types).

## CLI

```bash
tiny-context map ./src
tiny-context map ./report.docx
tiny-context query ./contract.pdf "termination notice" -n 5
tiny-context read ./contract.pdf --pages 3-5
tiny-context read ./spec.md --heading Installation
tiny-context read ./book.xlsx --sheet Sales --range A1:F20
tiny-context table ./sales.csv "SELECT region, SUM(total) FROM t GROUP BY 1"
tiny-context log ./app.log --focus errors --since 2h
tiny-context diff ./v1.docx ./v2.docx
tiny-context validate ./out/data.json --schema ./schema.json
tiny-context extract ./docs/*.pdf --kind emails
tiny-context extract ./data.json --jq ".items[].name"
```

Exit code 0 on success, 1 with the teach-error on stderr otherwise. `tiny-context tools` lists the MCP tools.

## MCP config

Claude Code / Claude Desktop / Cursor / any MCP client (stdio):

```json
{
  "mcpServers": {
    "tiny-context": { "command": "npx", "args": ["-y", "@tinytools/context", "tiny-context-mcp"] }
  }
}
```

Then paste [`docs/AGENT_USAGE.md`](docs/AGENT_USAGE.md) into your `CLAUDE.md` / `AGENTS.md` / `.cursorrules` so the agent reaches for the tools at the right moments.

`TINY_TOOLS_DEBUG=1` logs each call to stderr.

## Tool reference

### file_map
`path` (file or directory) · `depth?` (default 2, max 8). Markdown/DOCX → heading tree with line/¶ and word counts; code → function/class/method signatures with line numbers + imports (regex per language: TS/JS, Python, Go, Rust, Java/Kotlin/C#/C/C++, Ruby, PHP, Swift, shell, SQL); XLSX → sheets, headers, row/col counts; PPTX → slide titles; PDF → pages, outline, first line per page; CSV → columns + row count; JSON → shape; log → levels + span; directory → size-annotated tree (skips `node_modules`, `.git`, `dist`, … with counts).

### query_file
`path` or `paths[]` (globs ok) · `query` · `regex?` · `max_results?` (8, cap 30) · `context_lines?` (2). Ranks ~700-char passages by BM25 with an exact-phrase boost; each hit shows `file · location (heading path)` and a short excerpt. Unreadable inputs are listed under `skipped:` and the rest still run.

### read_section
`path` · `locator` = `{heading}` | `{pages:"3-5"}` | `{lines:"120-180"}` | `{paras:"88-95"}` | `{sheet, range:"A1:F20" | "10-40"}` | `{slide: 4 | "2-5"}` · `max_tokens?` (2000, cap 8000). When capped, the response says exactly which locator continues.

### query_table
`path` (csv/tsv/parquet/xlsx/json) · `sql` (table `t`) · `max_rows?` (50, cap 200) · `out?` (CSV path for the full result) · `sheet?` (xlsx). Reports total result rows before capping. Errors include column names and types.

### summarize_log
`path` · `focus?` (`errors` | `warnings` | keyword/regex) · `since?` (ISO or `2h`/`30m`/`3d`) · `max_clusters?` (15, cap 50). Masks numbers/hex/uuids/ips/paths/urls/emails before grouping; recognises ISO, `YYYY/MM/DD`, syslog, Apache CLF and epoch timestamps.

### diff_files
`a` · `b` · `mode?` (`summary` | `unified`) · `max_hunks?` (20, cap 100). Two tables (csv/xlsx) → row-level add/remove/change (matched on the first column when it is unique); everything else → patience diff over extracted text with heading/page/¶ locations.

### validate_file
`path` · `schema?` (JSON Schema, draft-07 or 2020-12). Checks by extension: json/jsonl · yaml · xml/svg · csv/tsv · md/html links, anchors and images; always: BOM, invalid UTF-8, NUL bytes, mixed line endings.

### extract
`path` or `paths[]` · one of `pattern` (+ `ignore_case?`) | `kind` (`emails` `urls` `dates` `numbers`) | `jq` · `max_matches?` (100, cap 500) · `dedupe?` (true). jq uses the system binary when installed; the fallback supports `.a.b`, `.items[]`, `.items[2].name`, `.["k"]`, `keys`, `length`, `values`, `..` and `|` chains.

## Limits (honest)

No embeddings — `query_file` is keyword ranking. Code outlines are regex-based. PDFs without a text layer (scans) report `NO TEXT LAYER`; OCR is out of scope. `query_table` sees one file as one table (no joins). Nothing here calls a network or a model.

License: MIT.
