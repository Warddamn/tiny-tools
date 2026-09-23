# tiny-tools — MCP tools for document search, spreadsheet SQL and agent workflows

**MCP tools for file analysis and reliable agent workflows.** `tiny-context` searches documents, queries spreadsheets and summarizes logs. `tiny-runtime` collects API pages with checkpoints, detects repeated failures and turns tool progress into cache-scheduling hints. Built by **AVRG3**.

Choose [file tools](#install) for documents, tables and logs, or [runtime tools](#install-tiny-runtime) for pagination, retry loops and progress integration.

**Looking for a tool for a specific task?** [Find the right tool, with example inputs](discovery/README.md) · [Machine-readable tool catalog](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/discovery/catalog.json) · [Copyable MCP config](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/discovery/mcp.json).

[![GitHub release](https://img.shields.io/github/v/release/Warddamn/tiny-tools)](https://github.com/Warddamn/tiny-tools/releases/latest)
[![CI](https://github.com/Warddamn/tiny-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/Warddamn/tiny-tools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Warddamn/tiny-tools/blob/main/LICENSE)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tiny-context&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi1wIiwiaHR0cHM6Ly9naXRodWIuY29tL1dhcmRkYW1uL3RpbnktdG9vbHMvcmVsZWFzZXMvZG93bmxvYWQvY29udGV4dC12MC4xLjEvdGlueS1jb250ZXh0LXN0YW5kYWxvbmUtMC4xLjEudGd6IiwidGlueS1jb250ZXh0LW1jcCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522tiny-context%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522-p%2522%252C%2522https%253A%252F%252Fgithub.com%252FWarddamn%252Ftiny-tools%252Freleases%252Fdownload%252Fcontext-v0.1.1%252Ftiny-context-standalone-0.1.1.tgz%2522%252C%2522tiny-context-mcp%2522%255D%257D)

**Designed for agents seeking fewer steps on file tasks:**

- **Explain a large error log:** `summarize_log` returns repeated errors, counts and time ranges without sending every log line into context.
- **Answer a spreadsheet question:** `query_table` runs SQL over CSV/XLSX/Parquet and returns the result instead of the source rows.
- **Find a PDF, Word or PowerPoint passage:** go directly to `query_file` for ranked matches or `read_section` for a known location. `file_map` supplies an outline when needed.
- **Resume a paginated API job:** `collect_pages` saves checkpoints and returns a clear completion status without a model turn for each page.
- **Investigate repeated agent failures:** `check_progress` analyzes a trace; automatic blocking requires the host SDK integration.

**Measure the whole task:** the tool response can be much smaller than the source file, but startup, validation and extra agent turns still cost time. Results depend on the task and client. [Agent comparison, including regressions](evals/COMPARISON.md) · [Historical first comparison](https://github.com/Warddamn/tiny-tools/blob/main/evals/COMPARISON-2026-09-19.md).

The whole-file-read benchmark below measures a different baseline; its savings are not a prediction for a capable agent.

## Find the tools

Official MCP Registry entries: [tiny-context](https://registry.modelcontextprotocol.io/?q=io.github.Warddamn%2Ftiny-context) (`io.github.Warddamn/tiny-context`) and [tiny-runtime](https://registry.modelcontextprotocol.io/?q=io.github.Warddamn%2Ftiny-runtime) (`io.github.Warddamn/tiny-runtime`). [Task guide](discovery/README.md) · [Plain-text overview](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/llms.txt) · [Glama repository profile](https://glama.ai/mcp/servers/Warddamn/tiny-tools).

The public catalog includes all 11 tool descriptions and input schemas, generated from the two actual servers and checked in CI. A directory profile does not by itself prove successful inspection or search placement; [current discovery status](DISCOVERY.md). Your client must connect and permit the chosen server before an agent can call it.

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

Then paste the snippet below into `CLAUDE.md` / `AGENTS.md` / `.cursorrules` so the agent reaches for the tools at the right moments. Claude Code users can also add the [Read guard hook](packages/context#the-read-guard-hook-recommended), an optional stricter policy. Start with the snippet; the hook did not improve the measured comparison.

## Try it with your agent

Restart or reconnect your client after setup. Confirm that `tiny-context` is connected and exposes eight tools. Then use the [three worked examples](QUICKSTART.md) for a CSV question, a PDF clause and an error log, with expected answers.

**Claude Code plugin:** `/plugin marketplace add Warddamn/tiny-tools`, then `/plugin install tiny-context@tiny-tools`. This includes both the server and task-selection guidance. Choose this or the manual MCP setup to avoid duplicate servers.

## Privacy

- **No telemetry from the tools.** No usage reports or analytics are sent by the server.
- The published tiny-context tools process local files and return selected text to your MCP client. They do not call a model or upload files themselves; your client may send that text to its model provider according to its settings.
- tiny-runtime also supports explicitly configured HTTP GET sources and an optional SDK cache adapter; requests go only to the configured endpoints. It has no telemetry or model calls.
- First launch downloads the release and third-party dependencies using npm, including optional DuckDB for `query_table`. This is not an offline installer. GitHub and npm maintain their own download counters; those are not counts of agents or people.

## Install tiny-runtime

**Three tools for agent developers:** resumable API pagination (`collect_pages`), repeated-failure trace analysis (`check_progress`), and tool-progress cache hints (`plan_cache`). The SDK supports automatic guards and live progress delivery; cache effects require a compatible serving engine.

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tiny-runtime&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi1wIiwiaHR0cHM6Ly9naXRodWIuY29tL1dhcmRkYW1uL3RpbnktdG9vbHMvcmVsZWFzZXMvZG93bmxvYWQvcnVudGltZS12MC4xLjEvdGlueS1ydW50aW1lLTAuMS4xLnRneiIsInRpbnktcnVudGltZS1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522tiny-runtime%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522-p%2522%252C%2522https%253A%252F%252Fgithub.com%252FWarddamn%252Ftiny-tools%252Freleases%252Fdownload%252Fruntime-v0.1.1%252Ftiny-runtime-0.1.1.tgz%2522%252C%2522tiny-runtime-mcp%2522%255D%257D)

```bash
claude mcp add tiny-runtime -- npx -y -p https://github.com/Warddamn/tiny-tools/releases/download/runtime-v0.1.1/tiny-runtime-0.1.1.tgz tiny-runtime-mcp
```

Or download the [portable MCPB bundle](https://github.com/Warddamn/tiny-tools/releases/download/runtime-v0.1.1/tiny-runtime-0.1.1.mcpb). Requires Node.js 20+. No npm account is needed. [All client options](packages/runtime/README.md#public-install) · [Three worked examples](packages/runtime/QUICKSTART.md) · [Registry listing](https://registry.modelcontextprotocol.io/?q=io.github.Warddamn%2Ftiny-runtime).

**When to choose it:** collect a configured multi-page dataset with a clear completion status; investigate repeated failures against measured state; or integrate tool progress into an inference server. A small note, one API request or an existing correct script often needs no extra tool. The first five agent selection/answer checks passed; [validation and limits](packages/runtime/docs/VALIDATION.md) do not establish real-world token or GPU savings.

## Available packages

- [`tiny-context`](packages/context): eight file-analysis tools, with a CLI and library. Published version 0.1.1.
- [`tiny-runtime`](packages/runtime): three API pagination, retry-trace and progress tools, with a CLI and SDK. Published version 0.1.1.

Other media tools in the original [build specification](AGENT_BUILD_SPEC.md) are unimplemented roadmap ideas, not available products.

## Agent usage snippet (all installed packages)

```markdown
## tiny-context (installed MCP)
- For large or PDF/Office files, choose the shortest useful path: `query_file` for a question, `read_section` for a known location, `file_map` only when you need an outline. Skip extra calls once the answer is sufficient.
- Questions about CSV/TSV/XLSX/Parquet data ("total by…", "how many rows…"): `query_table` with SQL (table is `t`). Never load raw rows into context.
- Logs: `summarize_log` first (add `focus: "errors"`); Grep/`extract` only afterwards, for the exact message it surfaced.
- Comparing two files, including office formats: `diff_files` (summary mode) instead of reading both.
- Verifying JSON/CSV/YAML/HTML/Markdown you just wrote: `validate_file`. Pulling emails/URLs/IDs/jq values out of files: `extract`.
- Small plain-text files (< 20 KB, e.g. notes, configs, short docs): just Read them and answer — do NOT also call file_map/query_file on a file you have already read. Grep is right for an exact string in one text file.
```

## Benchmarks — `tiny-context`

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

Full table and method: [`bench/RESULTS.md`](bench/RESULTS.md). Tool-selection evals: [`evals/RESULTS.md`](evals/RESULTS.md). **Read the next section before quoting the 99.9%.**

## Does it actually help? (measured honestly)

The benchmark above compares against *reading whole files*. A capable agent with a shell doesn't do that — so we also ran the same 12 tasks through headless Claude Code in four conditions with identical built-ins (Bash, Read, Grep, Glob) allowed:

| Condition | Correct | Avg turns | Total tokens | Cost | Time |
|---|---|---:|---:|---:|---:|
| no tiny-context | 12/12 | 4.3 | 1,488,617 | $2.41 | 193s |
| tiny-context, descriptions only | 12/12 | 3.8 | 1,192,953 | $2.02 | 104s |
| tiny-context + 6-line snippet | 12/12 | 3.5 | 1,186,570 | $1.95 | 97s |
| tiny-context + Read guard hook | 12/12 | 3.9 | 1,248,524 | $2.04 | 144s |

Historical 2026-09-19 run, before this patch: same answers either way. In that single run: **~20% fewer tokens, ~50% less wall-clock, fewer turns** — because one call replaces a loop of shell probes, and every turn carries ~24k tokens of fixed context. The 99.9% figure applies to agents that cannot run a shell or open the file at all. Historical table and method: [`evals/COMPARISON-2026-09-19.md`](evals/COMPARISON-2026-09-19.md); what we concluded from it: [`PROPOSALS.md`](PROPOSALS.md).

## Size

<!-- size:start -->
Install size: **134.7 MB** (108 packages) — **21.9 MB without DuckDB**, which only `query_table` needs. Largest: @duckdb/node-bindings-darwin-arm64 112.1 MB · zod 5.9 MB · @modelcontextprotocol/sdk 4.1 MB · unpdf 2.0 MB. _Measured 2026-09-22 by `npm run bench`._
<!-- size:end -->

## Design rules every tool follows

Whole jobs, not endpoints · files in, summaries out · safe output defaults (never overwrite an input; `-1`, `-2` on collision) · errors that teach (what went wrong **and** what to do next) · deterministic processing with explicit checkpoint/trace state · descriptions written as prompts (USE WHEN / PREFER OVER / DOES NOT / EXAMPLE / RETURNS) · validate before working · batches report per file · every response bounded (≤ ~4,000 tokens) · a savings or timing line on every response · ≤ 8 tools per server · absolute paths in responses.

## Develop

```bash
npm install
npm test          # builds, then tests all packages, MCP stdio integration, CLI
npm run bench     # fixtures + benchmark table → bench/RESULTS.md, embedded in READMEs
npm run demo:runtime  # synthetic demo of all three runtime helpers
npm run bench:runtime # compare against an ordinary correct script
npm run evals     # headless Claude Code tool-selection evals → evals/RESULTS.md
npm run discovery:catalog # regenerate public schemas + pinned install config from local builds
npm run discovery:check   # fail if the public catalog differs from the actual servers
```

Node ≥ 20, TypeScript, ESM. See `ENV.md`, `PROGRESS.md`, `DECISIONS.md`. MIT.

---
Built by **AVRG3** · MIT
