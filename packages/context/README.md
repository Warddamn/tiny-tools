# @tiny_tools_pw/context — `tiny-context`

**Know things about files without reading them.** Eight local, deterministic MCP tools that let an AI agent outline, search, slice, query, cluster, diff, validate and extract from files — including PDF, DOCX, PPTX and XLSX — and get back only what it needs, with a savings line on every response.

[![GitHub release](https://img.shields.io/github/v/release/Warddamn/tiny-tools)](https://github.com/Warddamn/tiny-tools/releases/latest)
[![CI](https://github.com/Warddamn/tiny-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/Warddamn/tiny-tools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Warddamn/tiny-tools/blob/main/LICENSE)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tiny-context&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi1wIiwiaHR0cHM6Ly9naXRodWIuY29tL1dhcmRkYW1uL3RpbnktdG9vbHMvcmVsZWFzZXMvZG93bmxvYWQvY29udGV4dC12MC4xLjEvdGlueS1jb250ZXh0LXN0YW5kYWxvbmUtMC4xLjEudGd6IiwidGlueS1jb250ZXh0LW1jcCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522tiny-context%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522-p%2522%252C%2522https%253A%252F%252Fgithub.com%252FWarddamn%252Ftiny-tools%252Freleases%252Fdownload%252Fcontext-v0.1.1%252Ftiny-context-standalone-0.1.1.tgz%2522%252C%2522tiny-context-mcp%2522%255D%257D)

**Designed for agents seeking fewer steps on file tasks:**

- **Explain a large error log:** `summarize_log` returns repeated errors, counts and time ranges without sending every log line into context.
- **Answer a spreadsheet question:** `query_table` runs SQL over CSV/XLSX/Parquet and returns the result instead of the source rows.
- **Find a PDF or Office passage:** `file_map`, `query_file` and `read_section` return an outline, ranked matches and the requested section.

**Measure the whole task:** the tool response can be much smaller than the source file, but startup, validation and extra agent turns still cost time. Results depend on the task and client. [Agent comparison, including regressions](https://github.com/Warddamn/tiny-tools/blob/main/evals/COMPARISON.md) · [Historical first comparison](https://github.com/Warddamn/tiny-tools/blob/main/evals/COMPARISON-2026-09-19.md).

The whole-file-read benchmark below measures a different baseline; its savings are not a prediction for a capable agent.

## Find tiny-context

Listed in the [official MCP Registry](https://registry.modelcontextprotocol.io/?q=io.github.Warddamn%2Ftiny-context) as `io.github.Warddamn/tiny-context` and indexed by [Glama](https://glama.ai/mcp/servers/Warddamn/tiny-tools). These listings expose the tool's purpose and installation information; your client must still connect it before an agent can call it.

## Safety update 0.1.1

Upgrade older installs using the current install button/config below, then reconnect the server. Existing version-pinned installations do not update automatically.

SQL accepts one read-only query against the supplied table. External file/network access and SQL write commands are disabled; exports require `out` and never replace existing files. Input/export limits are 64 MB; the query worker defaults to a 15-second deadline with bounded engine/JavaScript memory. These controls are not an operating-system security sandbox.

Go directly to `query_file` for a question or `read_section` for a known location; use `file_map` only when an outline is useful. Repeated document reads reuse a cache of up to eight files, 16 MB of serialized parsed data, and 30 seconds, checking file identity and modification metadata on every hit. The optional Read hook still builds an outline and starts a separate process; it can add work and is not required. Small text and exact-string searches often need only built-ins. Tools have startup/validation overhead and do not guarantee lower total cost on every task.

## Install

**MCPB-compatible clients:** download the bundle for your OS from the [agent bundle release](https://github.com/Warddamn/tiny-tools/releases/tag/context-v0.1.1) and open it in your client. `darwin` = macOS, `win32` = Windows, `linux` = Linux. Each bundles dependencies for x64 and arm64; a Node.js 20+ runtime is still required (some clients provide it). These are unsigned bundles with SHA-256 hashes in the registry. Downloads are approximately 77 MiB for macOS, 96 MiB for Linux and 34 MiB for Windows. All eight tools were tested from extracted bundles on macOS, Linux and Windows; not every CPU/OS combination or client UI has been tested.

**Other MCP clients:** use the existing commands below. They download only the dependencies needed for the current machine.

**Node.js 20+ required. No npm account or token needed.** Use the published GitHub release below. The npm package is not yet published; these commands do not depend on it. The server runs locally over stdio. Allow the first launch time to download its dependencies.

**Claude Code**

```bash
claude mcp add tiny-context -- npx -y -p https://github.com/Warddamn/tiny-tools/releases/download/context-v0.1.1/tiny-context-standalone-0.1.1.tgz tiny-context-mcp
```

**Codex CLI** (writes `[mcp_servers.tiny-context]` to `~/.codex/config.toml`)

```bash
codex mcp add tiny-context -- npx -y -p https://github.com/Warddamn/tiny-tools/releases/download/context-v0.1.1/tiny-context-standalone-0.1.1.tgz tiny-context-mcp
```

**Cursor** — `.cursor/mcp.json`, or click the *Install in Cursor* badge above

```json
{ "mcpServers": { "tiny-context": { "command": "npx", "args": ["-y", "-p", "https://github.com/Warddamn/tiny-tools/releases/download/context-v0.1.1/tiny-context-standalone-0.1.1.tgz", "tiny-context-mcp"] } } }
```

**VS Code** — `.vscode/mcp.json` (note the `servers` key), or click the *Install in VS Code* badge above

```json
{ "servers": { "tiny-context": { "type": "stdio", "command": "npx", "args": ["-y", "-p", "https://github.com/Warddamn/tiny-tools/releases/download/context-v0.1.1/tiny-context-standalone-0.1.1.tgz", "tiny-context-mcp"] } } }
```

**Windsurf** — `~/.codeium/windsurf/mcp_config.json`

```json
{ "mcpServers": { "tiny-context": { "command": "npx", "args": ["-y", "-p", "https://github.com/Warddamn/tiny-tools/releases/download/context-v0.1.1/tiny-context-standalone-0.1.1.tgz", "tiny-context-mcp"] } } }
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) · `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{ "mcpServers": { "tiny-context": { "command": "npx", "args": ["-y", "-p", "https://github.com/Warddamn/tiny-tools/releases/download/context-v0.1.1/tiny-context-standalone-0.1.1.tgz", "tiny-context-mcp"] } } }
```

Then paste [`docs/AGENT_USAGE.md`](docs/AGENT_USAGE.md) into your `CLAUDE.md` / `AGENTS.md` / `.cursorrules` so the agent reaches for the tools at the right moments. Claude Code users can also add the [Read guard hook](#the-read-guard-hook-recommended), an optional stricter policy. Start with the snippet; the hook did not improve the measured comparison.

`TINY_TOOLS_DEBUG=1` logs each call to stderr.

## Try it with your agent

Restart or reconnect your client after setup. Confirm that `tiny-context` is connected and exposes eight tools. Then use the [three worked examples](../../QUICKSTART.md) for a CSV question, a PDF clause and an error log, with expected answers.

**Claude Code plugin:** `/plugin marketplace add Warddamn/tiny-tools`, then `/plugin install tiny-context@tiny-tools`. This includes both the server and task-selection guidance. Choose this or the manual MCP setup to avoid duplicate servers.

## Privacy

- **No telemetry from the tools.** No usage reports or analytics are sent by the server.
- The tools process local files and return selected text to your MCP client. They do not call a model or upload files themselves; your client may send that text to its model provider according to its settings.
- First launch downloads the release and third-party dependencies using npm, including optional DuckDB for `query_table`. This is not an offline installer. GitHub and npm maintain their own download counters; those are not counts of agents or people.

## What it replaces

Whole-file `Read`/`cat` calls that mattered for one turn; `ls`+`grep`+`head` loops to learn what a folder holds; scripts written just to sum a column; `tail`/`grep` loops over logs; opening PDFs and Office files that built-in tools can't read at all.

## Why

~50% of a typical agent's context window is tool results, dominated by whole-file reads that mattered for one turn; agent workloads are read/review-heavy (~59% checking vs ~9% writing in published measurements); keeping intermediate data out of context has shown up-to-98% token reductions. These tools let an agent *know things about files without reading them*. Every response is bounded and ends with a savings line.

Reducing tokens-per-step and wall-clock-per-step is what lets an agent take more steps before its context degrades — a capability multiplier, not just a cost saving.

## Benchmarks

<!-- bench:start -->
**17 tasks · 7,417,733 naive tokens → 9,158 tool tokens · 99.9% saved overall · median 11ms per call**

| Tool | Task | Naive tokens | Tool tokens | Saved | Time |
|---|---|---:|---:|---:|---:|
| `query_table` | total sales by region (sales.csv) | 1,370,762 | 75 | 99.99% | 0.2s |
| `query_table` | how many rows have a negative total (sales.csv) | 1,370,762 | 37 | 99.99% | 0.2s |
| `query_table` | which columns exist and their types (sales.csv) | 1,370,762 | 186 | 99.99% | 0.2s |
| `summarize_log` | what's causing the 5xx spike (app.log) | 731,145 | 380 | 99.9% | 35ms |
| `summarize_log` | summarize this log (app.log) | 731,145 | 698 | 99.9% | 92ms |
| `file_map` | what's in this 100-page contract (contract.pdf) | 72,055 | 2,065 | 97.1% | 0.2s |
| `query_file` | where does the contract discuss termination (contract.pdf) | 72,055 | 713 | 99.0% | 14ms |
| `read_section` | read the termination pages (2 of 100) (contract.pdf) | 72,055 | 1,528 | 97.9% | 4ms |
| `file_map` | outline the 40-page handbook (handbook.docx) | 31,699 | 483 | 98.5% | 7ms |
| `query_file` | does the handbook cover remote work (handbook.docx) | 31,699 | 310 | 99.0% | 4ms |
| `read_section` | read the handbook's Termination section (handbook.docx) | 31,699 | 1,166 | 96.3% | 1ms |
| `extract` | every email address in the handbook (handbook.docx) | 31,699 | 51 | 99.8% | 2ms |
| `diff_files` | what changed between two handbook versions (handbook.docx ↔ handbook-v2.docx) | 63,429 | 293 | 99.5% | 5ms |
| `file_map` | what's in this source tree (src/) | 2,788 | 327 | 88.3% | 3ms |
| `file_map` | which functions are in this module (src/…/paths.ts) | 1,607 | 259 | 83.9% | 3ms |
| `query_file` | which functions call resolveInputs (src/**/*.ts) | 61,610 | 550 | 99.1% | 11ms |
| `validate_file` | is this 100k-row CSV well-formed (sales.csv) | 1,370,762 | 37 | 99.99% | 59ms |

_Fixtures (generated locally, seeded): sales.csv 5.2 MB · app.log 2.8 MB · contract.pdf 206 KB · handbook.docx 29 KB (100,000 rows · 50,000 lines · 100 pages · ~18k words) · src/ 38 TypeScript files._ · _Generated 2026-09-22; re-run with `npm run bench`._
<!-- bench:end -->

Measured the way an agent would experience it: **naive** = tokens to read the raw content the task needs (bytes/4); **tool** = tokens of the tool's full response. Fixtures are generated locally by `bench/`.

**Historical comparison (2026-09-19, before this patch):** the same 12 tasks through headless Claude Code with and without tiny-context gave identical answers; the tools cut tokens ~20%, cost ~19%, wall-clock ~50% and turns 4.3 → 3.5, because one call replaces a loop of shell probes. See the archived `evals/COMPARISON-2026-09-19.md`; current results are in `evals/COMPARISON.md`.

## Size

<!-- size:start -->
Install size: **134.7 MB** (108 packages) — **21.9 MB without DuckDB**, which only `query_table` needs. Largest: @duckdb/node-bindings-darwin-arm64 112.1 MB · zod 5.9 MB · @modelcontextprotocol/sdk 4.1 MB · unpdf 2.0 MB. _Measured 2026-09-22 by `npm run bench`._
<!-- size:end -->

Dependencies and why each one earns its place:

| Dependency | Why | Loaded |
|---|---|---|
| `@modelcontextprotocol/sdk` | the official MCP server/client (stdio) | at start |
| `zod` | one schema drives lib, CLI and MCP; param descriptions live here | at start |
| `commander` | the CLI | CLI only |
| `@tiny_tools_pw/shared` | path/glob resolution, safe outputs, teach-errors, ledger, text extraction (pdf via `unpdf`, office via `fflate` + regex) | at start; `unpdf` lazily |
| `@duckdb/node-api` *(optional, native)* | SQL over CSV/TSV/Parquet/XLSX in `query_table` | lazily, only for `query_table` |
| `ajv` · `yaml` · `fast-xml-parser` | JSON Schema · YAML · XML checks in `validate_file` | lazily, per check |

No models, no binaries, no network. `extract` uses system `jq` when present and a built-in path subset otherwise.

## The Read guard hook (recommended)

Tool descriptions and the snippet make an agent *choose* tiny-context. The hook removes the choice: it intercepts the built-in **Read** when the target is a PDF/DOCX/PPTX/XLSX (which Read can't open) or a text file over 20 KB, blocks it, and hands the agent the file's outline plus the exact follow-up calls (`read_section`, `query_file`, `query_table`, `summarize_log`). Small files and Reads that already pass `offset`/`limit` are untouched. Any error inside the hook lets the Read through.

Claude Code — add to `~/.claude/settings.json` (all projects) or `.claude/settings.json` (one project):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Read", "hooks": [ { "type": "command", "command": "tiny-context-read-guard", "timeout": 30 } ] }
    ]
  }
}
```

`tiny-context-read-guard` is on PATH after `npm i -g https://github.com/Warddamn/tiny-tools/releases/download/context-v0.1.1/tiny-context-standalone-0.1.1.tgz` (or use the full path to `hooks/read-guard.mjs`). Threshold: `TINY_CONTEXT_READ_GUARD_KB` (default 20). Measured effect: see `evals/COMPARISON.md` (the **hook** condition runs with no snippet at all).

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

---
Built by **AVRG3** · MIT
