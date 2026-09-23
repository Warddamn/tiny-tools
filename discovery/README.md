# Find an MCP tool for document search, spreadsheet SQL, logs or agent retry loops

tiny-tools by **AVRG3** provides two local MCP servers. Pick the one that solves the current task. Both have public GitHub releases; no npm account is required. Node.js 20+ and an MCP client that can launch a local stdio process are required.

- **tiny-context:** search PDF, Word and PowerPoint files; query CSV, Excel and Parquet with SQL; summarize repeated log errors; compare, validate and extract from files.
- **tiny-runtime:** resume cursor-based API pagination; inspect agent retry loops; derive advisory cache hints for instrumented serving engines.

## Agent-readable entry points

- [Plain-text overview](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/llms.txt)
- [Tool catalog with all 11 actual MCP input schemas](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/discovery/catalog.json)
- [Copyable MCP configuration](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/discovery/mcp.json) — contains two independent servers; keep only the one you need. It uses the `mcpServers` layout supported by Claude Desktop and Cursor. Other clients may use a different configuration layout.
- [tiny-context installation](../README.md#install) · [tiny-runtime installation](../packages/runtime/README.md#public-install)

The catalog is generated from the servers' actual `initialize` and `tools/list` responses. It is a project-specific discovery aid, not a standard that automatically registers or installs tools in every agent. Agents must have the chosen server connected and permitted before calling it.

## Search a PDF, Word document or PowerPoint without loading the whole file

Use **tiny-context / query_file** for “find the termination clause in a PDF,” “search a Word handbook for remote work,” or “find the pricing slide.” Results include matching passages and their locations. Go directly to the question; an outline is optional.

```json
{"path":"/data/contract.pdf","query":"termination notice period","max_results":3}
```

Use `read_section` when a page, heading, slide or cell range is already known. Use `file_map` to discover an unfamiliar document's structure. Text extraction is not OCR: image-only scans need an OCR tool first. For a small plain-text file, Read or Grep is often simpler.

## Query CSV, Excel or Parquet with SQL

Use **tiny-context / query_table** for “total sales by region,” “count negative amounts,” or “group spreadsheet rows by status.” The input is registered as SQL table `t`; the tool returns bounded results instead of feeding every row to the model.

```json
{"path":"/data/sales.csv","sql":"SELECT region, SUM(amount) AS total FROM t GROUP BY region"}
```

The query reads the explicitly supplied table. It does not modify a database, run arbitrary SQL writes, or fetch remote tables. Input/export caps are 64 MB. Use a database's own aggregate query or an existing correct script when that already solves the task.

## Summarize repeated errors in a large log

Use **tiny-context / summarize_log** for “why did 5xx errors spike?” or “which error messages repeat most?” It groups similar lines and reports counts and time ranges with bounded examples.

```json
{"path":"/data/app.log","focus":"errors","max_clusters":10}
```

This is deterministic clustering, not a guarantee of root-cause diagnosis. An exact known message in a small log often needs only Grep.

## Compare document versions, validate files or extract values

Use **tiny-context / diff_files** to summarize changes between two document or table files. Use `validate_file` for supported syntax/schema checks and internal-link checks. Use `extract` for emails, URLs, dates, regex matches or JSON values. These tools do not judge factual truth or replace visual review of formatting.

```json
{"a":"/data/handbook-before.docx","b":"/data/handbook-after.docx","mode":"summary"}
```

## Resume a paginated API collection after interruption

Use **tiny-runtime / collect_pages** for “fetch all cursor pages,” “resume a partially collected dataset,” or “sum records without a model turn for every page.” Supply an explicit source configuration. It writes records and checkpoints locally and distinguishes `complete`, `partial` and `failed`.

```json
{"config":"/data/collect.json","output_dir":"/data/results"}
```

Pass a returned checkpoint path back unchanged to resume. Do not read the collected records into model context just to continue. [Source configuration and runnable examples](../packages/runtime/QUICKSTART.md) explain mappings, consistency checks and credentials. This does not infer arbitrary API schemas, retry writes, or prove more completeness than the source contract supports. Prefer source-side filtering and aggregation when available.

## Diagnose an agent repeating failures or getting stuck in a retry loop

Use **tiny-runtime / check_progress** for a long tool trace with trusted state fingerprints. It reports repeated failures, stalls and cycles. Successful repeated reads are allowed.

```json
{"path":"/data/guard-trace.json","output_dir":"/data/reports"}
```

Installing the MCP server does not automatically intercept or stop another agent's tools. Automatic enforcement requires the host's `RepeatGuard` / `runGuarded` SDK integration. A short, obvious failure needs no extra tool. [Trace format and SDK integration](../packages/runtime/README.md).

## Plan cache hints from measured tool progress

Use **tiny-runtime / plan_cache** only when developing a compatible serving-engine integration or replaying measured tool-progress traces. It returns expiring retain/prefetch/release advice; it does not change GPU memory, control hosted models or establish token savings. [Integration contract and limits](../packages/runtime/README.md).

## Evidence, installation checks and limits

[Try three file tasks with expected answers](../QUICKSTART.md) · [Try the three runtime tools](../packages/runtime/QUICKSTART.md) · [Agent evaluations](../evals/COMPARISON.md) · [Runtime validation](../packages/runtime/docs/VALIDATION.md).

Smaller tool output can reduce context, but startup and extra calls can add time. No universal speed, token or GPU-saving claim. No telemetry or model calls inside the tools; the client may send returned text to its model provider. Explicit runtime HTTP sources use their configured network endpoints.

## Reproducible directory inspection

From the repository root, `docker build -t tiny-context-inspection .` builds the default tiny-context stdio server. `docker build --target tiny-runtime -t tiny-runtime-inspection .` builds the separate three-tool server. The images run as an unprivileged user. MCP clients must keep stdin open, for example `docker run --rm -i tiny-context-inspection`.

For local files, explicitly mount the needed directory: `docker run --rm -i --mount type=bind,source=/absolute/data,target=/data,readonly tiny-context-inspection`. Container paths are `/data/...`. Read-only mounts prevent exports into that directory; use an explicitly writable output mount when a task needs files written. A remote directory inspection cannot read files on your computer.

CI checks the actual tool catalog and exercises all 11 tools in separate containers with networking disabled, read-only inputs, a read-only image and a temporary writable output directory. Directory ingestion and web search indexing happen on third-party schedules; a successful build does not guarantee a listing, ranking, installation or use.
