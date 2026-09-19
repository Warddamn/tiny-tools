---
name: tiny-context
description: Token-saving file tools (file_map, query_file, read_section, query_table, summarize_log, diff_files, validate_file, extract) from the tiny-context MCP server. Use BEFORE reading any large file (over 20 KB), BEFORE opening ANY PDF, DOCX, PPTX or XLSX (the built-in Read cannot open them), for any question about spreadsheet or CSV/TSV/Parquet data (totals, counts, which columns), for logs (what is failing, error spikes), for diffs between two files or versions, and for validating JSON/YAML/CSV/HTML/Markdown you just wrote. Reach for these instead of Read, cat, grep or head loops on big or office-format files.
---

# tiny-context — when to use which tool

## tiny-context (installed MCP)
- Before reading any file > 20 KB, or ANY PDF/DOCX/XLSX/PPTX: call `file_map` first, then `query_file` / `read_section` for the part you need. Do not Read whole large files.
- Questions about CSV/TSV/XLSX/Parquet data ("total by…", "how many rows…"): `query_table` with SQL (table is `t`). Never load raw rows into context.
- Logs: `summarize_log` first (add `focus: "errors"`); Grep/`extract` only afterwards, for the exact message it surfaced.
- Comparing two files, including office formats: `diff_files` (summary mode) instead of reading both.
- Verifying JSON/CSV/YAML/HTML/Markdown you just wrote: `validate_file`. Pulling emails/URLs/IDs/jq values out of files: `extract`.
- Small plain-text files (< 20 KB, e.g. notes, configs, short docs): just Read them and answer — do NOT also call file_map/query_file on a file you have already read. Grep is right for an exact string in one text file.

## Tool cheat-sheet (8 tools)
- `file_map` — outline of a file or folder without its contents: headings, function signatures, sheets and columns, slide titles, pages, size tree. Start here for anything big or unfamiliar.
- `query_file` — ranked passages (BM25 with exact-phrase boost, or regex) across one or many files, including PDF/office, each with an exact location. Then read only the hit.
- `read_section` — just the located part: `{heading}` · `{pages:"3-5"}` · `{lines:"120-180"}` · `{paras:"88-95"}` · `{sheet, range:"A1:F20"}` · `{slide: 4}`. Capped responses say which locator continues.
- `query_table` — DuckDB SQL over CSV/TSV/Parquet/XLSX; the table is always `t`; total rows are reported; pass `out` to write the full result to a CSV instead of into context.
- `summarize_log` — log lines clustered into templates with counts, first/last time and one sample each, plus level counts and a rate timeline; `focus: "errors"`, `since: "2h"`.
- `diff_files` — what changed between two files (`summary` mode, ~100 tokens, or `unified`); works outside git and on DOCX/XLSX/PDF; tables get row add/remove/change counts.
- `validate_file` — JSON/YAML/XML parse, CSV shape, JSON Schema (`schema`), Markdown/HTML internal links and images, BOM/encoding/NUL/mixed line-ending checks.
- `extract` — regex (`pattern`), built-in kinds (`emails`, `urls`, `dates`, `numbers`) or `jq` values with locations and counts, deduped, across many files including PDF/office.

Every response ends with a ledger line (`Returned ~N tokens · raw ≈ M tokens · X% saved · T`); every error says what went wrong and what to do next.
