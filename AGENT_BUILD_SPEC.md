# TINY TOOLS — Build Spec for Claude Code

**Mission:** Build a monorepo of small, local-first tools that AI agents install with one config line and *actually use* to cut their time and token spend. The premise: reducing tokens-per-step and wall-clock-per-step is what lets agents take more steps before their context degrades — it is a capability multiplier, not just a cost saving.

Every tool ships in three layers from one codebase: **core library → CLI → MCP server**. The MCP layer is the product.

**Suggested kickoff prompt for this spec:** *"Read AGENT_BUILD_SPEC.md fully. Execute Phase 0 and Phase 1, then stop for review."*

---

## 0. How to Work (operating instructions for the coding agent)

1. **Read this entire file before writing code.** Follow the Build Order in §7 exactly.
2. **Environment check first.** Run: `node --version` (need ≥ 20), and `which ffmpeg ffprobe whisper-cli soffice google-chrome chromium` (or macOS/Windows equivalents). Write results to `ENV.md`. Missing binaries do not block the build — the tools detect them at runtime (§2 stack) — but note them so you know which packages you can integration-test locally.
3. **Work autonomously.** Do not stop to ask questions unless truly blocked. When a decision isn't covered here, make the simplest choice consistent with §1 and §3, and log it in `DECISIONS.md` (one line: decision + why).
4. **Keep `PROGRESS.md` current:** a checkbox list of packages × Definition of Done items (§12). Update it as you go; it's how the human resumes a session.
5. **Tests gate progress.** A package is not done until its tests pass. Never delete or weaken a test to move faster.
6. **Commit after every package reaches Definition of Done** (conventional commits: `feat(context): query_table`). Commit the scaffold separately.
7. **Stop at checkpoints** (marked in §7) and post a short summary: what was built, test results, benchmark numbers, open questions.
8. **Every dependency must justify itself.** Before adding one, note its install size in the package README's "Size" section. Tiny is part of the product.

---

## 1. Philosophy

1. **90/10 rule.** Each tool does the 10% of some giant app or workflow that covers 90% of real use. Reject scope creep aggressively.
2. **Local-first.** All processing on the user's machine. No accounts, uploads, cloud APIs, or telemetry. "Your files never leave your device" is a feature.
3. **Tiny.** Minimal dependencies, lazy-load heavy ones, never bundle binaries or models (detect on PATH / download to cache on first use).
4. **Agent-native.** Tools are designed so a model calls them correctly on the first try and gets back *only what it needs*. §3 defines this precisely.
5. **Beat the built-ins or don't build it.** Coding agents already have Read, Grep, Glob, and a shell. A tool that merely duplicates those will never be selected. Every tool must be clearly better than the agent's built-in path for its use case — and its description must say when the built-in is fine (honesty makes tool selection accurate). See the "beats" column in §6.

---

## 2. Architecture

```
tiny-tools/
├── package.json               # npm workspaces, TypeScript, ESM
├── tsconfig.base.json
├── ENV.md · PROGRESS.md · DECISIONS.md
├── packages/
│   ├── shared/                # path validation, glob expansion, output naming, teach-errors, ledger, timing, binary detection, text extraction (pdf/docx/pptx/xlsx → text)
│   ├── context/               # FLAGSHIP: token-saver toolkit — build first
│   ├── images/                # batch image processing
│   ├── pdf/                   # PDF toolkit
│   ├── video/                 # trim / convert / gif            (system ffmpeg)
│   ├── audio/                 # normalize / trim / strip silence (system ffmpeg)
│   ├── verify/                # render + screenshot + visual diff (system Chrome)
│   ├── transcribe/            # audio/video → text               (system whisper.cpp)
│   └── bgremove/              # background removal               (ONNX model, cached)
├── bench/                     # benchmark harness — §8
├── evals/                     # tool-selection evals — §9
└── README.md
```

**Each package:**
```
src/lib/      pure functions — ALL logic lives here. No console.log, no process.exit, no argv.
src/cli.ts    commander wrapper, ~50 lines, bin: tiny-<name>
src/mcp.ts    MCP stdio server, ~50–100 lines, bin: tiny-<name>-mcp
src/schemas.ts  zod schemas shared by CLI + MCP (single source of truth for params + descriptions)
test/         vitest unit tests (lib) + one MCP integration test (client → server over stdio)
docs/AGENT_USAGE.md   the snippet users paste into CLAUDE.md / AGENTS.md — §10
README.md     what it replaces · size · benchmark numbers · MCP config snippet · tool reference
```

**Stack:**

| Concern | Choice |
|---|---|
| Language | TypeScript, Node ≥ 20, ESM only, strict |
| MCP | `@modelcontextprotocol/sdk` (official), stdio transport. Verify API shape against the README of the version you install. |
| Validation | `zod` — infer types from schemas so lib/CLI/MCP never drift |
| CLI | `commander` |
| Tests | `vitest` |
| Tables | `@duckdb/node-api` (lazy-loaded, only in `context.query_table`) |
| Images | `sharp` |
| PDF | `pdf-lib` (write/manipulate) + a text-extraction lib (read) in `shared` |
| Office text | small pure-JS extractors in `shared` for docx/pptx/xlsx → text (unzip + XML) |
| Video/audio | system `ffmpeg`/`ffprobe` via `execa` — never bundled |
| Rendering | `puppeteer-core` driving an installed Chrome/Edge/Chromium — never download a browser |
| Transcription | system `whisper-cli` (whisper.cpp); model auto-downloaded to `~/.cache/tiny-tools/models/` |
| Segmentation | `onnxruntime-node` + small open background-matting model, cached the same way |

**System-binary pattern (ffmpeg, Chrome, whisper, soffice):** `shared/detect.ts` finds the binary on PATH and common install locations. If missing, the tool returns a teach-error with the exact install command per platform (§3 rule 4). Detection result is cached per process.

---

## 3. Agent Tool Design Rules (non-negotiable)

These are what make tools *helpful* rather than API wrappers. Every tool in every package follows all of them.

1. **Whole jobs, not endpoints.** One call completes a user-meaningful task. `remove_background({inputs, output_dir})` — not load/run/mask/save.
2. **Files in, summaries out.** Inputs are absolute paths or globs. Outputs are written to disk; the response is **paths + a short text summary** (what was written, sizes, counts, durations). **Never return raw file contents or base64** except where §6 explicitly allows (`verify` inline images, `context` capped excerpts).
3. **Safe output defaults.** Omitted `output`/`output_dir` → write next to input with a suffix (`photo.jpg → photo-resized.webp`). **Never overwrite an input.** Existing output → append `-1`, `-2`… and say so.
4. **Errors that teach.** Every error says what went wrong AND what to do next.
   - Bad: `Error: ENOENT` · Good: `Input not found: /tmp/photo.jpg — accepts absolute paths and globs like './shots/*.png'`
   - Bad: `ffmpeg failed` · Good: `ffmpeg not found on PATH. Install: 'brew install ffmpeg' (macOS) · 'winget install ffmpeg' (Windows) · 'sudo apt install ffmpeg' (Linux), then retry.`
   - SQL error → include the table's column names + types so the next attempt succeeds.
5. **Deterministic, idempotent, stateless.** Same input + options → same result. Safe to retry. No sessions or "current document."
6. **Descriptions are prompts.** Use the template in §4. State: what it does · USE WHEN · PREFER OVER (the built-in, and when the built-in is fine) · DOES NOT · one EXAMPLE call · RETURNS. Every param `.describe()` includes default + example.
7. **Validate before working.** Check all inputs exist and are the right type BEFORE starting. Fail fast with the list of bad inputs, not on file 37 of 50.
8. **Batches report per-file.** Partial failure → `succeeded: [...]`, `failed: [{path, reason}]`. Never all-or-nothing.
9. **Bound every response.** Hard caps on rows, matches, excerpt lines, and total response size (default ≤ 4,000 tokens ≈ 16 KB). Always say when a cap was hit and how to narrow.
10. **Progress on long jobs.** Video/model/transcription tools send MCP progress notifications when the client supports them; every response includes elapsed time.
11. **Report the savings.** Any tool whose alternative is *the agent reading content* (`context`, `verify.check_links`, `pdf.pdf_info`, etc.) ends its response with a ledger line from `shared/ledger.ts`: `Returned ~214 tokens · raw ≈ 48,200 tokens · 99.6% saved · 0.4s` (tokens ≈ bytes/4). All other tools end with `files: N · 2.1s`. This makes the value visible in every transcript.
12. **≤ 8 tools per server, one domain per server.** Small tool lists keep agent tool-selection accurate. Never merge into a mega-server.
13. **Absolute paths in responses.** Agents chain calls; relative paths break chains.

---

## 4. Reference Patterns (copy these; don't reinvent per package)

### 4.1 MCP server skeleton (`src/mcp.ts`)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { queryTable } from "./lib/query-table.js";
import { QueryTableInput } from "./schemas.js";
import { toolError, timed } from "@tinytools/shared";

const server = new McpServer({ name: "tiny-context", version: "0.1.0" });

server.registerTool(
  "query_table",
  {
    title: "Query a CSV/XLSX/Parquet with SQL",
    description: QUERY_TABLE_DESCRIPTION,   // built with the §4.2 template
    inputSchema: QueryTableInput.shape,     // zod shape; same schema drives the CLI
  },
  async (args) => {
    try {
      const { result, elapsed } = await timed(() => queryTable(args));
      return { content: [{ type: "text", text: result.summary + "\n" + result.ledger(elapsed) }] };
    } catch (e) {
      return toolError(e); // { isError: true, content: [{ type: "text", text: <teach-error> }] }
    }
  }
);

await server.connect(new StdioServerTransport());
```

Rules: the handler never contains logic — it validates (zod does it), calls lib, formats. Log to stderr only (stdout is the protocol channel).

### 4.2 Tool description template

```
<One sentence: what it does.>
USE WHEN: <situations phrased the way a user would phrase them>.
PREFER OVER: <built-in alternative> when <condition>; <built-in> is fine when <condition>.
DOES NOT: <limits — be honest, it makes selection accurate>.
EXAMPLE: query_table({ path: "/abs/sales.csv", sql: "SELECT region, SUM(total) FROM t GROUP BY 1" })
RETURNS: <shape of the summary> + savings line.
```

Param descriptions: `z.string().describe("Absolute file path or glob. Example: '/data/shots/*.png'. Required.")` · `z.number().optional().describe("Max rows returned. Default 50, hard cap 200.")`

### 4.3 Response shape (text)

```
<one-line headline: what happened>
<the payload: table / list / excerpts — bounded per rule 9>
<caveats: caps hit, files skipped, mode used>
<ledger line — rule 11>
```

### 4.4 Shared helpers (`packages/shared`)

- `resolveInputs(patterns): Promise<string[]>` — expands globs, validates existence, returns absolute paths or throws a teach-error listing every bad input.
- `outputPath(input, {suffix, ext, dir})` — safe naming with collision suffixing (rule 3).
- `toolError(err)` / `teach(message, nextStep)` — formats rule-4 errors for MCP + CLI.
- `ledger({returnedText, rawBytes, elapsedMs})` → the rule-11 line.
- `detect(binary)` — system-binary detection with per-platform install hints.
- `extractText(path)` — text from pdf/docx/pptx/xlsx/md/txt/code with location markers (page / sheet / heading / line). Used by `context` and `pdf`.
- `estimateTokens(bytes)` — bytes/4.

---

## 5. Getting the Tools *Used* (this is half the product)

Availability ≠ utilization. Three mechanisms, all required:

1. **Descriptions that trigger** (§4.2). Explicit "PREFER OVER Read when the file is over ~20 KB or is a PDF/DOCX/XLSX/PPTX" lines are what make a model choose the tool.
2. **An agent-facing usage snippet per package** (`docs/AGENT_USAGE.md`) that users paste into `CLAUDE.md` / `AGENTS.md` / `.cursorrules`. Example for `context`:
   ```
   ## tiny-context (installed MCP)
   - Before reading any file > 20 KB, or any PDF/DOCX/XLSX/PPTX: call file_map, then query_file / read_section. Do not Read whole large files.
   - Questions about CSV/XLSX/Parquet data: use query_table with SQL. Never load raw rows.
   - Logs: summarize_log first; grep only after.
   - Verifying your own JSON/CSV/HTML/Markdown output: validate_file.
   ```
   Root README shows the combined snippet for all installed packages.
3. **Evals prove it** (§9). If an agent given the snippet + server still reads the raw file, the description or snippet is wrong — fix it until it isn't.

---

## 6. Package Specifications

### 6.1 `context` — token-saver toolkit *(FLAGSHIP, build first)*

MCP server: `tiny-context` · 8 tools · pure TS except lazy-loaded DuckDB

**README rationale (include verbatim):** ~50% of a typical agent's context window is tool results, dominated by whole-file reads that mattered for one turn; agent workloads are read/review-heavy (~59% checking vs ~9% writing in published measurements); keeping intermediate data out of context has shown up-to-98% token reductions. These tools let an agent *know things about files without reading them*. Every response is bounded and ends with a savings line.

| Tool | Params | Behavior | Beats built-in because |
|---|---|---|---|
| `file_map` | `path` (file or dir), `depth?` (default 2) | Structural outline, not contents: md/docx → heading tree + line/para refs; code → function/class signatures per language (regex-based, not tree-sitter); xlsx → sheets, column headers, row counts; pptx → slide titles; pdf → page count + outline/first-line-per-page; dir → size-annotated tree with file counts. | One call replaces ls+grep+head loops; works on office/PDF formats built-ins can't open. |
| `query_file` | `path` or `paths[]`, `query`, `max_results?` (8), `context_lines?` (2) | Ranked passages matching the query (BM25 over chunks + exact/regex hits), each with location (line / page / sheet!cell / heading path). Works on txt/md/code/pdf/docx/pptx/xlsx via `extractText`. No embeddings in v1. | Grep can't search PDFs/office files or rank across many files; returns locations so the follow-up read is surgical. Description must say: *for a single plain-text file, Grep is fine.* |
| `read_section` | `path`, `locator` (`{heading}` \| `{pages:"3-5"}` \| `{lines:"120-180"}` \| `{sheet, range}` \| `{slide}`) , `max_tokens?` (2000) | The surgical read: returns only the located section, capped, with "truncated at N, narrow with…" when capped. | Read can't slice a PDF/DOCX/XLSX; pairs with `file_map`/`query_file` to replace whole-file reads. |
| `query_table` | `path`, `sql`, `max_rows?` (50, cap 200), `out?` (write full result to CSV) | DuckDB over CSV/TSV/Parquet/XLSX (file registered as table `t`; xlsx via DuckDB extension, fallback to shared xlsx→csv). Reports total result rows before capping. SQL error → message + columns/types. | Aggregates without the data ever entering context; no script writing. |
| `summarize_log` | `path`, `focus?`, `since?` (ISO or "2h"), `max_clusters?` (15) | Template-mining clustering of repeated lines (simple drain-style: mask numbers/hex/uuids/paths → group). Returns top clusters with counts, first/last timestamp, a bucketed rate timeline, total lines, and 1 sample line per cluster. | 80k lines → ~300 tokens; tail/grep loops can't see structure. |
| `diff_files` | `a`, `b`, `mode?` (`summary` default \| `unified`), `max_hunks?` (20) | `summary`: changed sections with locations and ± counts; tables: added/removed/changed row counts + samples; docx/pdf: diff on extracted text. `unified`: capped diff. | Works outside git and on office formats; summary mode is ~100 tokens. |
| `validate_file` | `path`, `schema?` (JSON Schema path) | Deterministic checks: JSON/YAML/XML/CSV parse; CSV column-count consistency; JSON Schema conformance; markdown/HTML broken internal links + missing images; encoding/BOM issues. Returns PASS or line-numbered failures. | One call, no linter setup; every deterministic check is reasoning the agent doesn't spend re-reading its own output. |
| `extract` | `path` or `paths[]`, `pattern?` (regex) or `jq?` (filter for JSON) or `kind?` (`emails`\|`urls`\|`dates`\|`numbers`), `max_matches?` (100), `dedupe?` (true) | Needles from a haystack with locations; never surrounding bulk. | Grep can't run on office/PDF; dedupe + kinds + jq in one place. |

CLI examples: `tiny-context map ./src` · `tiny-context query ./contract.pdf "termination"` · `tiny-context table ./sales.csv "SELECT region, SUM(total) FROM t GROUP BY 1"` · `tiny-context log ./app.log --focus errors`

### 6.2 `images` — batch image processing

MCP server: `tiny-images` · `sharp`

| Tool | Params | Notes |
|---|---|---|
| `resize_images` | `inputs`, `width?`, `height?`, `fit?` (cover/contain/inside=default), `output_dir?` | Aspect preserved unless both dims + cover |
| `convert_images` | `inputs`, `format` (webp/jpeg/png/avif), `quality?` (82), `output_dir?` | Size before→after per file |
| `compress_images` | `inputs`, `target_kb?` or `quality?`, `output_dir?` | `target_kb` → binary-search quality |
| `watermark_images` | `inputs`, `watermark` (image path or text), `position?` (bottom-right), `opacity?` (0.5), `scale?`, `output_dir?` | Text via bundled open font |
| `crop_images` | `inputs`, `width`, `height`, `gravity?` (center), `output_dir?` | |
| `rename_images` | `inputs`, `pattern` (e.g. `product-{n:03}{ext}`), `output_dir?` | Copies; never renames in place |
| `image_info` | `inputs` | Dimensions, format, size, DPI, alpha — as a text table (rule 11 ledger applies) |

### 6.3 `pdf` — PDF toolkit

MCP server: `tiny-pdf` · `pdf-lib` + shared extractor

| Tool | Params | Notes |
|---|---|---|
| `merge_pdfs` | `inputs` (ordered), `output` | |
| `split_pdf` | `input`, `ranges` (`"1-3,7,9-12"`) or `every_n`, `output_dir?` | |
| `extract_pages` | `input`, `pages`, `output` | |
| `rotate_pages` | `input`, `pages?` (all), `degrees` (90/180/270), `output?` | |
| `pdf_info` | `input` | Pages, dimensions, metadata, encrypted?, **form field names** (so `fill_form` is discoverable), outline. Ledger applies. |
| `pdf_to_images` | `input`, `pages?`, `dpi?` (150), `output_dir?` | Via `pdftoppm` if present, else `verify.render_pdf_page` path; teach-error if neither |
| `fill_form` | `input`, `fields` (object), `output`, `flatten?` | Unknown field → error listing valid names |

### 6.4 `video` — trim / convert / GIF *(system ffmpeg)*

MCP server: `tiny-video`

| Tool | Params | Notes |
|---|---|---|
| `trim_video` | `input`, `start` (`"0:12"` or `"12.5"`), `end?` or `duration?`, `output?` | Stream-copy when possible (instant); report mode |
| `convert_video` | `input`, `format` (mp4/webm), `resolution?`, `crf?`, `output?` | |
| `to_gif` | `input`, `start?`, `duration?`, `fps?` (12), `width?` (480), `output?` | Two-pass palette |
| `extract_audio` | `input`, `format?` (mp3), `output?` | |
| `extract_frames` | `input`, `every_seconds?` (10) or `count?`, `width?` (640), `output_dir?` | Contact-sheet option `sheet: true` → one image; lets a text agent "look at" a video cheaply |
| `video_info` | `input` | ffprobe summary |

### 6.5 `audio` — cleanup *(system ffmpeg)*

MCP server: `tiny-audio`

| Tool | Params | Notes |
|---|---|---|
| `normalize_audio` | `input`, `target_lufs?` (-16), `output?` | loudnorm |
| `trim_audio` | `input`, `start`, `end?`, `output?` | |
| `strip_silence` | `input`, `threshold_db?` (-35), `min_silence_ms?` (700), `output?` | Report time removed |
| `fade_audio` | `input`, `fade_in_s?`, `fade_out_s?`, `output?` | |
| `convert_audio` | `input`, `format` (mp3/wav/ogg/m4a), `bitrate?`, `output?` | |

### 6.6 `verify` — let the agent see what it made *(system Chrome/Edge/Chromium)*

MCP server: `tiny-verify` · `puppeteer-core` against an installed browser (detect; never download). Closes the biggest agent feedback gap: agents generate HTML/PDF/docs blind.

| Tool | Params | Notes |
|---|---|---|
| `render_html` | `input` (file path or URL), `output?`, `viewport?` (1280×800), `full_page?` (true), `inline?` (false) | Screenshot → PNG path. `inline: true` also returns MCP image content, downscaled to ≤ 1280 px wide (bounded tokens). Also returns console errors + failed network requests — the agent gets "what broke" in the same call. |
| `render_pdf_page` | `input`, `page` (1), `dpi?` (110), `output?`, `inline?` | Page → PNG |
| `render_document` | `input` (docx/pptx/xlsx), `page?`, `output?`, `inline?` | Via `soffice --convert-to pdf` if installed → `render_pdf_page`; teach-error otherwise |
| `visual_diff` | `a`, `b`, `output?`, `threshold?` (0.1) | Highlighted-diff PNG + % pixels changed + bounding boxes of change |
| `check_links` | `input` (html/md file or URL), `external?` (false) | Broken internal links/anchors/images; external HEAD checks opt-in with concurrency cap |

### 6.7 `transcribe` — ears *(system whisper.cpp)*

MCP server: `tiny-transcribe`

| Tool | Params | Notes |
|---|---|---|
| `transcribe` | `input` (audio/video), `language?` (auto), `model?` (`base` default; auto-download), `format?` (txt/srt/json), `output?` | Video → `ffmpeg` audio extract first. Returns path, duration, word count, detected language, first 3 lines — not the transcript (use `context.query_file` / `read_section` on the output). Progress notifications. |
| `transcript_summary` | `input` (transcript txt/srt/json), `max_tokens?` (600) | Deterministic: speaker/timestamp density, sections by silence gaps, top terms, length stats. No LLM calls. |

### 6.8 `bgremove` — background removal *(ONNX, build last)*

MCP server: `tiny-bgremove`

| Tool | Params | Notes |
|---|---|---|
| `remove_background` | `inputs`, `output_dir?`, `background?` (`transparent` default \| hex \| image path) | PNG for transparent; first run downloads model with clear progress; batch per rule 8 |
| `replace_background` | `inputs`, `background` (required), `output_dir?` | Same pipeline, composited |

---

## 7. Build Order & Checkpoints

**Phase 0 — Scaffold.** Workspaces, tsconfig, vitest, `shared` (all §4.4 helpers with unit tests, incl. `extractText` for md/txt/code/pdf/docx/xlsx/pptx), `ENV.md`, `PROGRESS.md`. Commit.
→ **CHECKPOINT A**: post ENV results + shared test status. (Human review is quick here; proceed to Phase 1 unless told otherwise.)

**Phase 1 — `context` end-to-end + `bench/`.** Build `file_map`, `query_file`, `read_section`, `extract` first (pure TS), then `query_table`, `summarize_log`, `diff_files`, `validate_file`. CLI + MCP + integration test + `docs/AGENT_USAGE.md`. Then build the benchmark harness (§8) and generate the first numbers into the README.
→ **CHECKPOINT B**: post benchmark table + eval results. **Stop here for review before continuing** — this phase decides whether the project's thesis holds.

**Phase 2 — `images`, `pdf`.** No system binaries; fast wins.

**Phase 3 — `video`, `audio`, `verify`, `transcribe`.** All use the shared binary-detection pattern; test the missing-binary teach-error path for each.

**Phase 4 — `bgremove`.** Model download + ONNX.

**Phase 5 — Publish & discovery (§11)** + root README (combined AGENT_USAGE snippet, benchmark table, per-package config snippets).
→ **CHECKPOINT C**: final summary.

---

## 8. Proving the Savings (`bench/`)

Agent users adopt tools on measured deltas, not claims. For each `context` tool (and `verify.check_links`, `pdf.pdf_info`), run a realistic task **both ways** and report tokens + wall-clock:

- **Fixtures** (generated by a script, small ones committed): ~100k-row CSV; ~50k-line log with injected error bursts; a ~100-page text-heavy PDF; a ~40-page DOCX; a mid-size source tree (vendor a permissively-licensed OSS snapshot).
- **Tasks** phrased as a user would: "total sales by region", "what's causing the 5xx spike", "where does the contract discuss termination", "which functions call `parseConfig`".
- **Measure:** (a) naive — tokens to read the raw content the agent would need (bytes/4 of the file(s)); (b) tool — tokens of the tool's full response. Report absolute tokens, % saved, runtime.
- **Output** a markdown table checked into `bench/RESULTS.md` and embedded in the root README; re-run in CI so numbers stay honest. Format for quotability: `query_table · 48,200 → 210 tokens · 99.6% · 0.3s`.

## 9. Tool-Selection Evals (`evals/`)

A tool is only helpful if an agent picks it and calls it correctly on the first try.

- Per package, write 5–10 task prompts in natural user language (not tool names): "how many rows in sales.csv have a negative total?", "does this deck mention pricing?".
- Run each against a real agent with the server attached and the AGENT_USAGE snippet in CLAUDE.md — headless Claude Code: `claude -p "<task>" --mcp-config evals/mcp.json --allowedTools "mcp__tiny-context__*"` (adjust flags to the installed CLI version) — capture the transcript.
- Assert: the intended tool was called, params were sane, and **no raw whole-file read of the large fixture occurred**.
- On failure, fix the **description, param descriptions, error message, or usage snippet** — never the eval. Descriptions are the product's UI for models.
- Include a negative case per package: a task where the built-in is correct (e.g. a 2 KB text file) and the tool should *not* be chosen — this checks that PREFER OVER honesty works.

## 10. Agent Usage Snippets

Each package ships `docs/AGENT_USAGE.md` (§5). Requirements: ≤ 8 lines; imperative; says when *not* to use the tools; names the built-in it replaces. The root README concatenates all installed packages' snippets into one copy-paste block.

## 11. Publish & Discovery (required)

1. **npm** — publish every package; keywords `mcp`, `mcp-server`, plus domain terms. Two bins each: `tiny-<name>`, `tiny-<name>-mcp`. Add `"mcpName": "io.github.<owner>/tiny-<name>"` to `package.json` (the registry validates npm ownership through it).
2. **Official MCP Registry** (registry.modelcontextprotocol.io) — one `server.json` per package; publish with the `mcp-publisher` CLI (GitHub-verified namespace). Aggregator directories (Smithery, PulseMCP, Glama, mcp.so) ingest from there automatically.
3. **GitHub** — `mcp-server` topic; each package README leads with: what it replaces, benchmark numbers, the one-line MCP config:
   ```json
   { "mcpServers": { "tiny-context": { "command": "npx", "args": ["-y", "tiny-context-mcp"] } } }
   ```

## 12. Definition of Done (per package)

- [ ] Lib functions pure, typed, unit-tested against real fixture files
- [ ] CLI: accurate `--help`, exit codes 0/1, same zod schemas as MCP
- [ ] MCP server starts on stdio; every tool description follows §4.2; integration test drives it with the SDK client (`listTools` + at least one `callTool` per tool)
- [ ] Teach-errors tested: missing input · bad format · existing output · missing system binary (where applicable) · cap hit
- [ ] Batch partial-failure tested (rule 8)
- [ ] No response contains raw file contents/base64 except where §6 allows; all responses bounded (rule 9)
- [ ] Ledger/timing line on every response (rule 11)
- [ ] `docs/AGENT_USAGE.md` written; tool-selection evals pass, including the negative case
- [ ] `context` only: benchmark table generated and embedded in README
- [ ] README: what it replaces · Size section (install size + deps) · benchmark numbers · CLI examples · MCP config snippet · tool reference
- [ ] `PROGRESS.md` updated; committed

## 13. Conventions & Scope

- Package names `tiny-context`, `tiny-images`, `tiny-pdf`, `tiny-video`, `tiny-audio`, `tiny-verify`, `tiny-transcribe`, `tiny-bgremove` (fall back to a scope like `@tinytools/context` if taken — stay consistent across all).
- Paths: accept `~`, relative (resolved against cwd), absolute, and globs; always *return* absolute. Handle Windows separators.
- Logging: stderr only in MCP mode. `TINY_TOOLS_DEBUG=1` enables verbose stderr.
- License: MIT.

**Out of scope — do not build:** web UIs; remote/HTTP MCP transport, auth, accounts; daemons/watch modes; any cloud API or LLM calls inside tools (everything deterministic and local); embeddings/vector search (v2 at the earliest).

---

## 14. Post-checkpoint proposals (added 2026-09-19 after Checkpoint B)

See `PROPOSALS.md` for evidence and designs. In brief: (a) ship an agent-native delivery of `context` — a Claude Code PreToolUse hook that turns oversized/binary `Read` calls into outlines, so the smart path is the default path (built; measured in `evals/COMPARISON.md`); (b) `run_command`, a bounded, type-aware digest of shell command output with the full log saved to disk — the largest remaining context hog for coding agents.
