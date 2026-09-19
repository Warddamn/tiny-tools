# tiny-tools

Small, local-first tools that AI agents install with one config line and *actually use* to cut their time and token spend. Every tool ships in three layers from one codebase: **core library → CLI → MCP server**. No accounts, no uploads, no cloud calls, no telemetry — your files never leave your device.

**Why:** reducing tokens-per-step and wall-clock-per-step is what lets an agent take more steps before its context degrades. It's a capability multiplier, not just a cost saving.

## Packages

| Package | MCP server | What it does | Status |
|---|---|---|---|
| [`@tinytools/context`](packages/context) | `tiny-context` | **Flagship.** Know things about files without reading them: outline, ranked search, surgical reads, SQL over tables, log clustering, diffs, validation, extraction — incl. PDF/DOCX/PPTX/XLSX | ✅ built, tested, benchmarked |
| `@tinytools/images` | `tiny-images` | batch resize / convert / compress / watermark / crop / rename / info | phase 2 |
| `@tinytools/pdf` | `tiny-pdf` | merge / split / extract / rotate / info / to-images / fill-form | phase 2 |
| `@tinytools/video` | `tiny-video` | trim / convert / gif / audio / frames / info (system ffmpeg) | phase 3 |
| `@tinytools/audio` | `tiny-audio` | normalize / trim / strip-silence / fade / convert (system ffmpeg) | phase 3 |
| `@tinytools/verify` | `tiny-verify` | render html/pdf/docs to PNG, visual diff, link check (system Chrome) | phase 3 |
| `@tinytools/transcribe` | `tiny-transcribe` | audio/video → text + deterministic transcript summary (system whisper.cpp) | phase 3 |
| `@tinytools/bgremove` | `tiny-bgremove` | background removal / replacement (ONNX, cached model) | phase 4 |

## Install (MCP)

```json
{
  "mcpServers": {
    "tiny-context": { "command": "npx", "args": ["-y", "-p", "@tinytools/context", "tiny-context-mcp"] }
  }
}
```

Then paste the snippet below into `CLAUDE.md` / `AGENTS.md` / `.cursorrules` so the agent reaches for the tools at the right moments.

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
**17 tasks · 7,413,803 naive tokens → 9,169 tool tokens · 99.9% saved overall · median 35ms per call**

| Tool | Task | Naive tokens | Tool tokens | Saved | Time |
|---|---|---:|---:|---:|---:|
| `query_table` | total sales by region (sales.csv) | 1,370,762 | 75 | 99.99% | 0.5s |
| `query_table` | how many rows have a negative total (sales.csv) | 1,370,762 | 37 | 99.99% | 0.4s |
| `query_table` | which columns exist and their types (sales.csv) | 1,370,762 | 186 | 99.99% | 0.3s |
| `summarize_log` | what's causing the 5xx spike (app.log) | 731,145 | 380 | 99.9% | 35ms |
| `summarize_log` | summarize this log (app.log) | 731,145 | 698 | 99.9% | 80ms |
| `file_map` | what's in this 100-page contract (contract.pdf) | 72,055 | 2,065 | 97.1% | 0.2s |
| `query_file` | where does the contract discuss termination (contract.pdf) | 72,055 | 713 | 99.0% | 0.1s |
| `read_section` | read the termination pages (2 of 100) (contract.pdf) | 72,055 | 1,528 | 97.9% | 0.1s |
| `file_map` | outline the 40-page handbook (handbook.docx) | 31,699 | 483 | 98.5% | 5ms |
| `query_file` | does the handbook cover remote work (handbook.docx) | 31,699 | 310 | 99.0% | 5ms |
| `read_section` | read the handbook's Termination section (handbook.docx) | 31,699 | 1,166 | 96.3% | 2ms |
| `extract` | every email address in the handbook (handbook.docx) | 31,699 | 51 | 99.8% | 3ms |
| `diff_files` | what changed between two handbook versions (handbook.docx ↔ handbook-v2.docx) | 63,429 | 293 | 99.5% | 4ms |
| `file_map` | what's in this source tree (src/) | 2,697 | 318 | 88.2% | 2ms |
| `file_map` | which functions are in this module (src/…/paths.ts) | 1,603 | 259 | 83.8% | 3ms |
| `query_file` | which functions call resolveInputs (src/**/*.ts) | 57,775 | 570 | 99.0% | 5ms |
| `validate_file` | is this 100k-row CSV well-formed (sales.csv) | 1,370,762 | 37 | 99.99% | 53ms |

_Fixtures (generated locally, seeded): sales.csv 5.2 MB · app.log 2.8 MB · contract.pdf 206 KB · handbook.docx 29 KB (100,000 rows · 50,000 lines · 100 pages · ~18k words) · src/ 37 TypeScript files._ · _Generated 2026-09-19; re-run with `npm run bench`._
<!-- bench:end -->

Full table and method: [`bench/RESULTS.md`](bench/RESULTS.md). Tool-selection evals: [`evals/RESULTS.md`](evals/RESULTS.md).

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
