## tiny-context (installed MCP)
- For large or PDF/Office files, choose the shortest useful path: `query_file` for a question, `read_section` for a known location, `file_map` only when you need an outline. Skip extra calls once the answer is sufficient.
- Questions about CSV/TSV/XLSX/Parquet data ("total by…", "how many rows…"): `query_table` with SQL (table is `t`). Never load raw rows into context.
- Logs: `summarize_log` first (add `focus: "errors"`); Grep/`extract` only afterwards, for the exact message it surfaced.
- Comparing documents: `diff_files` summary. For JSON/JSONL exports: `diff_files` mode `records`, explicit `key` JSON Pointers, optional `fields` scope; ignore reordered records, return actual changes. Prefer an existing correct script or source-side change feed when available.
- Recurring labeled forms with a saved profile: `extract` with `profile`, batch `paths`, and optional `out` for the complete report. Check `needs_review`. Save rules once; no automatic learning. Skip for one small file or an existing correct script.
- Verifying JSON/CSV/YAML/HTML/Markdown you just wrote: `validate_file`. Pulling emails/URLs/IDs/jq values out of files: `extract`.
- Small plain-text files (< 20 KB, e.g. notes, configs, short docs): just Read them and answer — do NOT also call file_map/query_file on a file you have already read. Grep is right for an exact string in one text file.
