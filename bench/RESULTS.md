# Benchmark results — tiny-context

_Generated 2026-09-22 on darwin arm64, Apple M3, node v24.16.0._

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

Fixtures (generated locally, seeded): sales.csv 5.2 MB · app.log 2.8 MB · contract.pdf 206 KB · handbook.docx 29 KB (100,000 rows · 50,000 lines · 100 pages · ~18k words) · src/ 38 TypeScript files.

Naive = tokens (bytes/4) an agent would spend reading the raw content the task needs — the file for text formats, the extracted text for PDF/DOCX (the built-in can't open them at all), the whole file for a section read. Tool = tokens of the tool's complete response including its savings line.

## Quotable

```
query_table · 1,370,762 → 75 tokens · 99.99% · 0.2s
query_table · 1,370,762 → 37 tokens · 99.99% · 0.2s
query_table · 1,370,762 → 186 tokens · 99.99% · 0.2s
summarize_log · 731,145 → 380 tokens · 99.9% · 35ms
summarize_log · 731,145 → 698 tokens · 99.9% · 92ms
file_map · 72,055 → 2,065 tokens · 97.1% · 0.2s
query_file · 72,055 → 713 tokens · 99.0% · 14ms
read_section · 72,055 → 1,528 tokens · 97.9% · 4ms
file_map · 31,699 → 483 tokens · 98.5% · 7ms
query_file · 31,699 → 310 tokens · 99.0% · 4ms
read_section · 31,699 → 1,166 tokens · 96.3% · 1ms
extract · 31,699 → 51 tokens · 99.8% · 2ms
diff_files · 63,429 → 293 tokens · 99.5% · 5ms
file_map · 2,788 → 327 tokens · 88.3% · 3ms
file_map · 1,607 → 259 tokens · 83.9% · 3ms
query_file · 61,610 → 550 tokens · 99.1% · 11ms
validate_file · 1,370,762 → 37 tokens · 99.99% · 59ms
```

## Install size (production dependency closure of @tiny_tools_pw/context)

Total **134.7 MB** across 108 packages — **21.9 MB without DuckDB** (optional; only `query_table` needs it).
Largest: @duckdb/node-bindings-darwin-arm64 112.1 MB · zod 5.9 MB · @modelcontextprotocol/sdk 4.1 MB · unpdf 2.0 MB · hono 1.3 MB · fast-xml-parser 1.3 MB.
