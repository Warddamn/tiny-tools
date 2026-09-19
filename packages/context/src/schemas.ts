/**
 * Single source of truth for tool params + descriptions (§4.2). Shared by the CLI and the MCP server.
 * Every param description includes its default and an example.
 */
import { z } from "zod";

const pathDesc = (what: string, example: string) =>
  `${what}. Accepts absolute paths, '~' paths and paths relative to the current directory. Example: '${example}'. Required.`;

// ───────────────────────── file_map ─────────────────────────
export const FileMapInput = z.object({
  path: z.string().describe(pathDesc("File or directory to outline", "/abs/project/src")),
  depth: z.number().int().min(1).max(8).optional().describe("Directory depth to show. Default 2, max 8. Ignored for files."),
});
export const FILE_MAP_DESCRIPTION = `Structural outline of a file or directory WITHOUT its contents: headings (md/docx), function/class signatures (code), sheets + column headers + row counts (xlsx), slide titles (pptx), page count + outline + first line per page (pdf), size-annotated tree (directory).
USE WHEN: "what's in this file/folder", "outline this document", "which functions are in here", "what sheets and columns does this spreadsheet have", or before deciding what to read.
PREFER OVER: Read/cat for any file over ~20 KB and for every PDF/DOCX/XLSX/PPTX (built-ins can't open them); over ls+grep+head loops for directories. Read is fine — and sufficient — for a small plain-text file (< ~20 KB): just Read it; do not call file_map on a file you have already read.
DOES NOT: return contents (use read_section), search inside files (use query_file), or parse code with a real parser (signatures are regex-based, so unusual syntax may be missed).
EXAMPLE: file_map({ path: "/abs/project/src", depth: 2 })  ·  file_map({ path: "/abs/contract.pdf" })
RETURNS: an outline with locations (line / page / sheet / slide / ¶) that read_section accepts, counts and sizes, then a savings line.`;

// ───────────────────────── query_file ─────────────────────────
export const QueryFileInput = z.object({
  path: z.string().optional().describe("One file (or glob) to search. Example: '/abs/docs/contract.pdf'. Use `paths` for several."),
  paths: z.array(z.string()).optional().describe("Several files or globs to search and rank together. Example: ['/abs/docs/*.pdf', '/abs/notes.md']."),
  query: z.string().min(1).describe("What to look for, in plain words or a phrase. Example: 'termination notice period'. Required."),
  regex: z.boolean().optional().describe("Treat `query` as a JavaScript regular expression instead of ranked keyword search. Default false."),
  max_results: z.number().int().min(1).max(30).optional().describe("Passages returned. Default 8, hard cap 30."),
  context_lines: z.number().int().min(0).max(10).optional().describe("Lines of context around each hit. Default 2, max 10."),
});
export const QUERY_FILE_DESCRIPTION = `Ranked passages matching a query inside one or many files (txt/md/code/pdf/docx/pptx/xlsx/csv), each with its exact location, so the follow-up read is surgical.
USE WHEN: "where does the contract discuss termination", "does this deck mention pricing", "find every place the spec talks about retries", "which of these docs cover X".
PREFER OVER: Read/cat of a LARGE file (> ~20 KB) just to find one passage; Grep for PDFs/DOCX/PPTX/XLSX (Grep can't open them) and for ranking across many files. Read is fine — and sufficient — for a small plain-text file: if you have already Read a file, you have everything this tool would return; do not call it on that file. Grep is fine for an exact string in one plain-text file.
DOES NOT: add anything to a file you have already read, use embeddings/semantic search (BM25 keyword ranking + exact-phrase boost), return whole files, or search binary formats other than the ones listed.
EXAMPLE: query_file({ path: "/abs/contract.pdf", query: "termination notice", max_results: 5 })
RETURNS: ranked hits "#1 file · page 12, line 3 (Heading > Sub)" with a short excerpt each, files/passages scanned, skipped files with reasons, then a savings line.`;

// ───────────────────────── read_section ─────────────────────────
export const LocatorSchema = z.object({
  heading: z.string().optional().describe("Heading text to read (case-insensitive substring; md/docx). Example: 'Termination'."),
  pages: z.string().optional().describe("Page range for PDFs. Example: '3-5' or '7' or '1,4,9'."),
  lines: z.string().optional().describe("Line range for text/code/markdown. Example: '120-180'."),
  paras: z.string().optional().describe("Paragraph range for DOCX (¶ numbers from file_map/query_file). Example: '88-95'."),
  sheet: z.string().optional().describe("Sheet name for XLSX. Example: 'Sales'. Combine with `range`."),
  range: z.string().optional().describe("Cell range or row range within `sheet`. Example: 'A1:F20' or '10-40'. Default: whole sheet (capped)."),
  slide: z.union([z.number().int().min(1), z.string()]).optional().describe("Slide number or range for PPTX. Example: 4 or '2-5'."),
});
export const ReadSectionInput = z.object({
  path: z.string().describe(pathDesc("File to read from", "/abs/contract.pdf")),
  locator: LocatorSchema.describe(
    "Exactly what to read: {heading} | {pages} | {lines} | {paras} | {sheet, range} | {slide}. Get locations from file_map or query_file. Example: { pages: '3-5' }. Required.",
  ),
  max_tokens: z.number().int().min(100).max(8000).optional().describe("Cap on returned text (≈ bytes/4). Default 2000, max 8000. When hit, the response says how to continue."),
});
export const READ_SECTION_DESCRIPTION = `The surgical read: returns ONLY the located section of a file — a heading's section, a page range, a line range, DOCX paragraphs, an XLSX sheet range, or PPTX slides — capped at max_tokens.
USE WHEN: you know where the content is (from file_map or query_file) and need the actual text of just that part; reading pages of a PDF, a sheet of a workbook, a section of a long doc.
PREFER OVER: Read/cat of the whole file when you need a slice, and always for PDF/DOCX/XLSX/PPTX (Read can't slice them). Read is fine for small plain-text files you need in full.
DOES NOT: search (use query_file), read whole large files (cap 8000 tokens — narrow the locator instead), or render images.
EXAMPLE: read_section({ path: "/abs/contract.pdf", locator: { pages: "3-5" } })  ·  read_section({ path: "/abs/spec.md", locator: { heading: "Installation" } })
RETURNS: the section text with line/page/¶ markers, word count, a "truncated at N — continue with …" note when capped, then a savings line.`;

// ───────────────────────── query_table ─────────────────────────
export const QueryTableInput = z.object({
  path: z.string().describe(pathDesc("CSV, TSV, Parquet or XLSX file", "/abs/sales.csv")),
  sql: z.string().min(1).describe("DuckDB SQL against the file, which is registered as table `t`. Example: 'SELECT region, SUM(total) AS total FROM t GROUP BY 1 ORDER BY 2 DESC'. Required."),
  max_rows: z.number().int().min(1).max(200).optional().describe("Rows returned. Default 50, hard cap 200. The total row count is always reported."),
  out: z.string().optional().describe("Write the FULL result to this CSV path (nothing is capped in the file). Example: '/abs/out/by-region.csv'."),
  sheet: z.string().optional().describe("XLSX only: sheet name to query. Default: first sheet."),
});
export const QUERY_TABLE_DESCRIPTION = `Run SQL (DuckDB) over a CSV/TSV/Parquet/XLSX file without the data ever entering your context. The file is table \`t\`.
USE WHEN: "total sales by region", "how many rows have a negative total", "top 10 customers", "which columns exist and what types", any aggregate/filter/join-free question about a table.
PREFER OVER: Read/cat/head of the table, writing a pandas/awk script, or loading rows to count them. Read is fine for a tiny table (< ~50 rows) you need verbatim.
DOES NOT: modify the file, join several files (one file = one table), or return more than 200 rows in-context (use \`out\` to write the full result to CSV).
EXAMPLE: query_table({ path: "/abs/sales.csv", sql: "SELECT region, SUM(total) FROM t GROUP BY 1" })  ·  query_table({ path: "/abs/sales.csv", sql: "DESCRIBE t" })
RETURNS: a markdown table of up to max_rows rows, column names/types, total result rows, the written file path when \`out\` is set, then a savings line. SQL errors include the table's columns and types so the next attempt succeeds.`;

// ───────────────────────── summarize_log ─────────────────────────
export const SummarizeLogInput = z.object({
  path: z.string().describe(pathDesc("Log file (any text log)", "/abs/logs/app.log")),
  focus: z.string().optional().describe("'errors', 'warnings', or a keyword/regex to cluster only matching lines. Example: 'timeout'. Default: all lines."),
  since: z.string().optional().describe("Only lines at/after this time: ISO timestamp or relative like '2h', '30m', '3d' (from now). Example: '2026-09-18T10:00:00'."),
  max_clusters: z.number().int().min(1).max(50).optional().describe("Clusters returned. Default 15, max 50."),
});
export const SUMMARIZE_LOG_DESCRIPTION = `Structure of a log file in ~300 tokens: repeated-message clusters (numbers/ids/paths masked) with counts, first/last time and one sample each, level counts, and a rate timeline — from 80k lines without reading them.
USE WHEN: "what's causing the 5xx spike", "summarize this log", "what errors are in here", "when did the failures start", before grepping.
PREFER OVER: tail/head/grep loops and Read on any log over a few hundred lines; run this first, then Grep/extract for the specific message. Read is fine for a log under ~100 lines.
DOES NOT: follow files live, parse binary logs, correlate across files, or explain root cause (it shows structure and timing so you can).
EXAMPLE: summarize_log({ path: "/abs/logs/app.log", focus: "errors", since: "2h" })
RETURNS: totals + time span + level counts, a bucketed timeline (all vs. focused lines), top clusters "#1 ×812 ERROR 10:41→10:52 <template>" with a sample line, then a savings line.`;

// ───────────────────────── diff_files ─────────────────────────
export const DiffFilesInput = z.object({
  a: z.string().describe(pathDesc("First file (the 'before')", "/abs/v1/contract.docx")),
  b: z.string().describe(pathDesc("Second file (the 'after')", "/abs/v2/contract.docx")),
  mode: z.enum(["summary", "unified"]).optional().describe("'summary' (default): changed sections with locations and ± counts, ~100 tokens. 'unified': a capped unified diff."),
  max_hunks: z.number().int().min(1).max(100).optional().describe("Hunks/sections reported. Default 20, max 100."),
});
export const DIFF_FILES_DESCRIPTION = `Compare two files and report what changed — works outside git and on PDF/DOCX/PPTX/XLSX/CSV (tables get added/removed/changed row counts + samples; documents diff on extracted text).
USE WHEN: "what changed between v1 and v2", "did the new export differ from the old one", "compare these two spreadsheets", verifying a rewrite kept the rest intact.
PREFER OVER: reading both files and comparing in your head; git diff when the files aren't in git or aren't plain text. git diff is fine for tracked plain-text files.
DOES NOT: diff directories, merge, or diff images/binaries other than the formats listed.
EXAMPLE: diff_files({ a: "/abs/v1/report.docx", b: "/abs/v2/report.docx" })  ·  diff_files({ a: "/abs/a.csv", b: "/abs/b.csv", mode: "summary" })
RETURNS: summary mode: per-section "+5 −1 at page 3 / lines 120–128 / ¶88 (Heading)" plus a one-line sample; tables: added/removed/changed rows with samples. unified mode: a capped unified diff. Then a savings line.`;

// ───────────────────────── validate_file ─────────────────────────
export const ValidateFileInput = z.object({
  path: z.string().describe(pathDesc("File to validate: JSON, YAML, XML, CSV/TSV, Markdown, HTML (others get encoding checks only)", "/abs/out/config.json")),
  schema: z.string().optional().describe("JSON Schema file to validate a JSON/YAML file against. Example: '/abs/schema.json'."),
});
export const VALIDATE_FILE_DESCRIPTION = `Deterministic checks on a file you (or someone) just wrote: JSON/YAML/XML parse, CSV column-count consistency, JSON Schema conformance, broken relative links/anchors/images in Markdown/HTML, encoding/BOM/NUL/mixed line endings.
USE WHEN: after generating or editing JSON/CSV/YAML/HTML/Markdown, "is this file valid", "check the links in this README", before handing a file to another tool or person.
PREFER OVER: re-reading your own output to eyeball it, or setting up a linter for one check. A language toolchain (tsc, eslint, pytest) is the right tool for source code — this does not run it.
DOES NOT: validate code syntax, check external URLs (use verify.check_links), or fix anything.
EXAMPLE: validate_file({ path: "/abs/out/data.json", schema: "/abs/schema.json" })  ·  validate_file({ path: "/abs/README.md" })
RETURNS: "PASS" with the checks run, or "FAIL" with line-numbered problems and what to do, then a savings line.`;

// ───────────────────────── extract ─────────────────────────
export const ExtractInput = z.object({
  path: z.string().optional().describe("One file (or glob). Example: '/abs/contacts.pdf'. Use `paths` for several."),
  paths: z.array(z.string()).optional().describe("Several files or globs. Example: ['/abs/docs/*.docx']."),
  pattern: z.string().optional().describe("JavaScript regex to extract; the first capture group is returned when present. Example: 'Invoice #(\\\\d+)'. One of pattern | jq | kind is required."),
  ignore_case: z.boolean().optional().describe("Case-insensitive `pattern`. Default false."),
  jq: z.string().optional().describe("jq filter for JSON files (system jq when installed; otherwise paths like '.items[].name', '.a.b', 'keys', 'length' and '|' chains). Example: '.items[] | .name'."),
  kind: z.enum(["emails", "urls", "dates", "numbers"]).optional().describe("Built-in extractor instead of a pattern. Example: 'emails'."),
  max_matches: z.number().int().min(1).max(500).optional().describe("Matches returned. Default 100, hard cap 500."),
  dedupe: z.boolean().optional().describe("Collapse identical values and count them. Default true."),
});
export const EXTRACT_DESCRIPTION = `Pull needles out of a haystack — regex matches, jq results, or built-in kinds (emails/urls/dates/numbers) — with locations and counts, never the surrounding bulk. Works on txt/md/code/pdf/docx/pptx/xlsx/csv/json.
USE WHEN: "list every email in these PDFs", "all invoice numbers in this folder", "what URLs does this deck reference", "get .items[].name from this JSON".
PREFER OVER: Read + scanning by eye; Grep for PDF/DOCX/PPTX/XLSX (Grep can't open them) and when you want deduped values with counts. Grep is fine for one plain-text file when you also want the surrounding lines.
DOES NOT: return context lines (use query_file), edit files, or run full jq programs without system jq (fallback supports paths, [], keys, length, | chains).
EXAMPLE: extract({ paths: ["/abs/docs/*.pdf"], kind: "emails" })  ·  extract({ path: "/abs/data.json", jq: ".items[].name" })  ·  extract({ path: "/abs/log.txt", pattern: "order-(\\\\d+)" })
RETURNS: "value ×count — file:location, …" lines (deduped by default), totals per file, skipped files with reasons, then a savings line.`;

export type FileMapArgs = z.infer<typeof FileMapInput>;
export type QueryFileArgs = z.infer<typeof QueryFileInput>;
export type ReadSectionArgs = z.infer<typeof ReadSectionInput>;
export type QueryTableArgs = z.infer<typeof QueryTableInput>;
export type SummarizeLogArgs = z.infer<typeof SummarizeLogInput>;
export type DiffFilesArgs = z.infer<typeof DiffFilesInput>;
export type ValidateFileArgs = z.infer<typeof ValidateFileInput>;
export type ExtractArgs = z.infer<typeof ExtractInput>;
