# tiny-tools

Small, local-first tools that AI agents install with one config line and *actually use* to cut their time and token spend — starting with **`tiny-context`**, an MCP server that lets an agent know things about files (PDF, DOCX, XLSX, CSV, logs, code) without reading them.

[![npm version](https://img.shields.io/npm/v/@tiny_tools_pw/context)](https://www.npmjs.com/package/@tiny_tools_pw/context)
[![npm downloads](https://img.shields.io/npm/dw/@tiny_tools_pw/context)](https://www.npmjs.com/package/@tiny_tools_pw/context)
[![CI](https://github.com/Warddamn/tiny-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/Warddamn/tiny-tools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Warddamn/tiny-tools/blob/main/LICENSE)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tiny-context&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi1wIiwiQHRpbnlfdG9vbHNfcHcvY29udGV4dCIsInRpbnktY29udGV4dC1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522tiny-context%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522-p%2522%252C%2522%2540tiny_tools_pw%252Fcontext%2522%252C%2522tiny-context-mcp%2522%255D%257D)

**Before → after, measured on this repo's fixtures** (read both columns together — the first is the ceiling, the second is what a capable coding agent actually gains):

| vs. reading whole files | vs. a shell-capable agent |
|---|---|
| **17 tasks · 7,415,930 naive tokens → 9,169 tool tokens · 99.9% saved** | **same answers, ~20% fewer tokens, ~50% less time** |
| what an agent pays when it `Read`s / `cat`s the file, or cannot open a PDF/DOCX/XLSX at all | headless Claude Code with Bash/Read/Grep/Glob, 12 tasks, with vs. without the tools |

Method and full tables: [Benchmarks](#benchmarks--tiny-context) · [Does it actually help?](#does-it-actually-help-measured-honestly)

**Why:** reducing tokens-per-step and wall-clock-per-step is what lets an agent take more steps before its context degrades. It's a capability multiplier, not just a cost saving.

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

Then paste the snippet below into `CLAUDE.md` / `AGENTS.md` / `.cursorrules` so the agent reaches for the tools at the right moments. Claude Code users can also add the [Read guard hook](packages/context#the-read-guard-hook-recommended), which turns that choice into a rule.

## Privacy

- **No telemetry.** Nothing is counted, phoned home or reported — not installs, not calls, not errors.
- **No network calls from any tool.** All eight tools read local files and return text; nothing here calls a model or an API.
- **Files never leave the device.** The server talks MCP over stdio to a client on the same machine; there is no upload path.
- The only optional network use is at **install time**, when npm downloads the optional `@duckdb/node-api` native dependency (needed only by `query_table`). Install with `npm install --omit=optional` to skip it; every other tool still works.

## Packages

| Package | MCP server | What it does | Status |
|---|---|---|---|
| [`@tiny_tools_pw/context`](packages/context) | `tiny-context` | **Flagship.** Know things about files without reading them: outline, ranked search, surgical reads, SQL over tables, log clustering, diffs, validation, extraction — incl. PDF/DOCX/PPTX/XLSX | ✅ built, tested, benchmarked |
| `@tiny_tools_pw/images` | `tiny-images` | batch resize / convert / compress / watermark / crop / rename / info | phase 2 |
| `@tiny_tools_pw/pdf` | `tiny-pdf` | merge / split / extract / rotate / info / to-images / fill-form | phase 2 |
| `@tiny_tools_pw/video` | `tiny-video` | trim / convert / gif / audio / frames / info (system ffmpeg) | phase 3 |
| `@tiny_tools_pw/audio` | `tiny-audio` | normalize / trim / strip-silence / fade / convert (system ffmpeg) | phase 3 |
| `@tiny_tools_pw/verify` | `tiny-verify` | render html/pdf/docs to PNG, visual diff, link check (system Chrome) | phase 3 |
| `@tiny_tools_pw/transcribe` | `tiny-transcribe` | audio/video → text + deterministic transcript summary (system whisper.cpp) | phase 3 |
| `@tiny_tools_pw/bgremove` | `tiny-bgremove` | background removal / replacement (ONNX, cached model) | phase 4 |

## Agent usage snippet (all installed packages)

```markdown
## tiny-context (installed MCP)
- Before reading any file > 20 KB, or ANY PDF/DOCX/XLSX/PPTX: call `file_map` first, then `query_file` / `read_section` for the part you need. Do not Read whole large files.
- Questions about CSV/TSV/XLSX/Parquet data ("total by…", "how many rows…"): `query_table` with SQL (table is `t`). Never load raw rows into context.
- Logs: `summarize_log` first (add `focus: "errors"`); Grep/`extract` only afterwards, for the exact message it surfaced.
- Comparing two files, including office formats: `diff_files` (summary mode) instead of reading both.
- Verifying JSON/CSV/YAML/HTML/Markdown you just wrote: `validate_file`. Pulling emails/URLs/IDs/jq values out of files: `extract`.
- Small plain-text files (< 20 KB, e.g. notes, configs, short docs): just Read them and answer — do NOT also call file_map/query_file on a file you have already read. Grep is right for an exact string in one text file.
```

## Benchmarks — `tiny-context`

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

Full table and method: [`bench/RESULTS.md`](bench/RESULTS.md). Tool-selection evals: [`evals/RESULTS.md`](evals/RESULTS.md). **Read the next section before quoting the 99.9%.**

## Does it actually help? (measured honestly)

The benchmark above compares against *reading whole files*. A capable agent with a shell doesn't do that — so we also ran the same 12 tasks through headless Claude Code in four conditions with identical built-ins (Bash, Read, Grep, Glob) allowed:

| Condition | Correct | Avg turns | Total tokens | Cost | Time |
|---|---|---:|---:|---:|---:|
| no tiny-context | 12/12 | 4.3 | 1,488,617 | $2.41 | 193s |
| tiny-context, descriptions only | 12/12 | 3.8 | 1,192,953 | $2.02 | 104s |
| tiny-context + 6-line snippet | 12/12 | 3.5 | 1,186,570 | $1.95 | 97s |
| tiny-context + Read guard hook | 12/12 | 3.9 | 1,248,524 | $2.04 | 144s |

Same answers either way. With the tools: **~20% fewer tokens, ~50% less wall-clock, fewer turns** — because one call replaces a loop of shell probes, and every turn carries ~24k tokens of fixed context. The 99.9% figure applies to agents that cannot run a shell or open the file at all. Full table and method: [`evals/COMPARISON.md`](evals/COMPARISON.md); what we concluded from it: [`PROPOSALS.md`](PROPOSALS.md).

## Size

<!-- size:start -->
Install size: **134.7 MB** (108 packages) — **21.9 MB without DuckDB**, which only `query_table` needs. Largest: @duckdb/node-bindings-darwin-arm64 112.1 MB · zod 5.9 MB · @modelcontextprotocol/sdk 4.1 MB · unpdf 2.0 MB. _Measured 2026-09-19 by `npm run bench`._
<!-- size:end -->

## Design rules every tool follows

Whole jobs, not endpoints · files in, summaries out · safe output defaults (never overwrite an input; `-1`, `-2` on collision) · errors that teach (what went wrong **and** what to do next) · deterministic and stateless · descriptions written as prompts (USE WHEN / PREFER OVER / DOES NOT / EXAMPLE / RETURNS) · validate before working · batches report per file · every response bounded (≤ ~4,000 tokens) · a savings line on every response · ≤ 8 tools per server · absolute paths in responses.

## Develop

```bash
npm install
npm test          # builds, then vitest (shared + context unit, MCP stdio integration, CLI)
npm run bench     # fixtures + benchmark table → bench/RESULTS.md, embedded in READMEs
npm run evals     # headless Claude Code tool-selection evals → evals/RESULTS.md
```

Node ≥ 20, TypeScript, ESM. See `ENV.md`, `PROGRESS.md`, `DECISIONS.md`. MIT.

---
Built by **AVRG3** · MIT
