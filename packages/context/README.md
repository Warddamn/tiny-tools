# @tiny_tools_pw/context — `tiny-context`

**Know things about files without reading them.** Eight local, deterministic MCP tools that let an AI agent outline, search, slice, query, cluster, diff, validate and extract from files — including PDF, DOCX, PPTX and XLSX — and get back only what it needs, with a savings line on every response.

[![npm version](https://img.shields.io/npm/v/@tiny_tools_pw/context)](https://www.npmjs.com/package/@tiny_tools_pw/context)
[![npm downloads](https://img.shields.io/npm/dw/@tiny_tools_pw/context)](https://www.npmjs.com/package/@tiny_tools_pw/context)
[![CI](https://github.com/Warddamn/tiny-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/Warddamn/tiny-tools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Warddamn/tiny-tools/blob/main/LICENSE)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tiny-context&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi1wIiwiQHRpbnlfdG9vbHNfcHcvY29udGV4dCIsInRpbnktY29udGV4dC1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522tiny-context%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522-p%2522%252C%2522%2540tiny_tools_pw%252Fcontext%2522%252C%2522tiny-context-mcp%2522%255D%257D)

**Before → after, measured on this package's fixtures** (read both columns together — the first is the ceiling, the second is what a capable coding agent actually gains):

| vs. reading whole files | vs. a shell-capable agent |
|---|---|
| **17 tasks · 7,415,930 naive tokens → 9,169 tool tokens · 99.9% saved** | **same answers, ~20% fewer tokens, ~50% less time** |
| what an agent pays when it `Read`s / `cat`s the file, or cannot open a PDF/DOCX/XLSX at all | headless Claude Code with Bash/Read/Grep/Glob, 12 tasks, with vs. without the tools |

Method and full tables: [Benchmarks](#benchmarks) · [evals/COMPARISON.md](https://github.com/Warddamn/tiny-tools/blob/main/evals/COMPARISON.md)

## Install

The server runs locally over stdio; every client below launches the same command, `npx -y -p @tiny_tools_pw/context tiny-context-mcp`.

**Claude Code**

```bash
claude mcp add tiny-context -- npx -y -p @tiny_tools_pw/context tiny-context-mcp
```

**Codex CLI** (writes `[mcp_servers.tiny-context]` to `~/.codex/config.toml`)

```bash
codex mcp add tiny-context -- npx -y -p @tiny_tools_pw/context tiny-context-mcp
```

**Cursor** — `.cursor/mcp.json`, or click the *Install in Cursor* badge above

```json
{ "mcpServers": { "tiny-context": { "command": "npx", "args": ["-y", "-p", "@tiny_tools_pw/context", "tiny-context-mcp"] } } }
```

**VS Code** — `.vscode/mcp.json` (note the `servers` key), or click the *Install in VS Code* badge above

```json
{ "servers": { "tiny-context": { "type": "stdio", "command": "npx", "args": ["-y", "-p", "@tiny_tools_pw/context", "tiny-context-mcp"] } } }
```

**Windsurf** — `~/.codeium/windsurf/mcp_config.json`

```json
{ "mcpServers": { "tiny-context": { "command": "npx", "args": ["-y", "-p", "@tiny_tools_pw/context", "tiny-context-mcp"] } } }
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) · `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{ "mcpServers": { "tiny-context": { "command": "npx", "args": ["-y", "-p", "@tiny_tools_pw/context", "tiny-context-mcp"] } } }
```

Then paste [`docs/AGENT_USAGE.md`](docs/AGENT_USAGE.md) into your `CLAUDE.md` / `AGENTS.md` / `.cursorrules` so the agent reaches for the tools at the right moments. Claude Code users can also add the [Read guard hook](#the-read-guard-hook-recommended), which turns that choice into a rule.

`TINY_TOOLS_DEBUG=1` logs each call to stderr.

## Privacy

- **No telemetry.** Nothing is counted, phoned home or reported — not installs, not calls, not errors.
- **No network calls from any tool.** All eight tools read local files and return text; nothing here calls a model or an API.
- **Files never leave the device.** The server talks MCP over stdio to a client on the same machine; there is no upload path.
- The only optional network use is at **install time**, when npm downloads the optional `@duckdb/node-api` native dependency (needed only by `query_table`). Install with `npm install --omit=optional` to skip it; every other tool still works.

## What it replaces

Whole-file `Read`/`cat` calls that mattered for one turn; `ls`+`grep`+`head` loops to learn what a folder holds; scripts written just to sum a column; `tail`/`grep` loops over logs; opening PDFs and Office files that built-in tools can't read at all.

## Why

~50% of a typical agent's context window is tool results, dominated by whole-file reads that mattered for one turn; agent workloads are read/review-heavy (~59% checking vs ~9% writing in published measurements); keeping intermediate data out of context has shown up-to-98% token reductions. These tools let an agent *know things about files without reading them*. Every response is bounded and ends with a savings line.

Reducing tokens-per-step and wall-clock-per-step is what lets an agent take more steps before its context degrades — a capability multiplier, not just a cost saving.

## Benchmarks

<!-- bench:start -->
**17 tasks · 7,415,930 naive tokens → 9,169 tool tokens · 99.9% saved overall · median 34ms per call**

| Tool | Task | Naive tokens | Tool tokens | Saved | Time |
|---|---|---:|---:|---:|---:|
| `query_table` | total sales by region (sales.csv) | 1,370,762 | 75 | 99.99% | 0.6s |
| `query_table` | how many rows have a negative total (sales.csv) | 1,370,762 | 37 | 99.99% | 0.5s |
| `query_table` | which columns exist and their types (sales.csv) | 1,370,762 | 186 | 99.99% | 0.3s |
| `summarize_log` | what's causing the 5xx spike (app.log) | 731,145 | 380 | 99.9% | 34ms |
| `summarize_log` | summarize this log (app.log) | 731,145 | 698 | 99.9% | 93ms |
| `file_map` | what's in this 100-page contract (contract.pdf) | 72,055 | 2,065 | 97.1% | 0.2s |
| `query_file` | where does the contract discuss termination (contract.pdf) | 72,055 | 713 | 99.0% | 0.1s |
| `read_section` | read the termination pages (2 of 100) (contract.pdf) | 72,055 | 1,528 | 97.9% | 0.1s |
| `file_map` | outline the 40-page handbook (handbook.docx) | 31,699 | 483 | 98.5% | 6ms |
| `query_file` | does the handbook cover remote work (handbook.docx) | 31,699 | 310 | 99.0% | 6ms |
| `read_section` | read the handbook's Termination section (handbook.docx) | 31,699 | 1,166 | 96.3% | 2ms |
| `extract` | every email address in the handbook (handbook.docx) | 31,699 | 51 | 99.8% | 3ms |
| `diff_files` | what changed between two handbook versions (handbook.docx ↔ handbook-v2.docx) | 63,429 | 293 | 99.5% | 4ms |
| `file_map` | what's in this source tree (src/) | 2,697 | 318 | 88.2% | 3ms |
| `file_map` | which functions are in this module (src/…/paths.ts) | 1,607 | 259 | 83.9% | 3ms |
| `query_file` | which functions call resolveInputs (src/**/*.ts) | 59,898 | 570 | 99.0% | 5ms |
| `validate_file` | is this 100k-row CSV well-formed (sales.csv) | 1,370,762 | 37 | 99.99% | 55ms |

_Fixtures (generated locally, seeded): sales.csv 5.2 MB · app.log 2.8 MB · contract.pdf 206 KB · handbook.docx 29 KB (100,000 rows · 50,000 lines · 100 pages · ~18k words) · src/ 37 TypeScript files._ · _Generated 2026-09-19; re-run with `npm run bench`._
<!-- bench:end -->

Measured the way an agent would experience it: **naive** = tokens to read the raw content the task needs (bytes/4); **tool** = tokens of the tool's full response. Fixtures are generated locally by `bench/`.

**Against a shell-capable agent the honest number is smaller:** the same 12 tasks through headless Claude Code with and without tiny-context gave identical answers; the tools cut tokens ~20%, cost ~19%, wall-clock ~50% and turns 4.3 → 3.5, because one call replaces a loop of shell probes. See `evals/COMPARISON.md` and `PROPOSALS.md`.

## Size

<!-- size:start -->
Install size: **134.7 MB** (108 packages) — **21.9 MB without DuckDB**, which only `query_table` needs. Largest: @duckdb/node-bindings-darwin-arm64 112.1 MB · zod 5.9 MB · @modelcontextprotocol/sdk 4.1 MB · unpdf 2.0 MB. _Measured 2026-09-19 by `npm run bench`._
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

`tiny-context-read-guard` is on PATH after `npm i -g @tiny_tools_pw/context` (or use the full path to `hooks/read-guard.mjs`). Threshold: `TINY_CONTEXT_READ_GUARD_KB` (default 20). Measured effect: see `evals/COMPARISON.md` (the **hook** condition runs with no snippet at all).

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
