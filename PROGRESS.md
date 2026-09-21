# PROGRESS

Legend: ✅ done · 🔄 in progress · ⬜ not started · — n/a

## Phase 0 — Scaffold
- [x] Workspaces, tsconfig, vitest wired
- [x] `shared`: resolveInputs · outputPath · teach/toolError · ledger · detect · extractText (md/txt/code/pdf/docx/xlsx/pptx) · estimateTokens · timed
- [x] `shared` unit tests green (43)
- [x] ENV.md · PROGRESS.md · DECISIONS.md
- [x] Commit → CHECKPOINT A (e425f09)

## Phase 1 — `context` (flagship) + bench + evals
| Definition of Done item | context |
|---|---|
| Lib pure, typed, unit-tested on real fixtures | ✅ 44 unit tests |
| CLI: `--help`, exit codes, same zod schemas | ✅ 4 tests |
| MCP server on stdio; §4.2 descriptions; integration test (listTools + callTool per tool) | ✅ 11 tests (SDK client over stdio) |
| Teach-errors tested: missing input · bad format · existing output · missing binary · cap hit | ✅ (missing binary n/a — no binaries in context; `jq` optional) |
| Batch partial-failure tested | ✅ query_file + extract report `skipped:` |
| No raw contents/base64; responses bounded | ✅ boundText 16 KB; read_section max_tokens ≤ 8000 |
| Ledger/timing line on every response | ✅ asserted in MCP + CLI tests |
| docs/AGENT_USAGE.md; evals pass incl. negative case | ✅ 12/12 (2026-09-19, headless claude; negative case fixed by sharpening the snippet + descriptions, 3/3 stable) |
| Benchmark table generated + embedded in README | ✅ 17 tasks, bench/RESULTS.md + both READMEs |
| README complete (replaces · Size · benchmarks · CLI · MCP config · tool reference) | ✅ |
| PROGRESS.md updated; committed | ✅ |

Tools: file_map ✅ · query_file ✅ · read_section ✅ · extract ✅ · query_table ✅ · summarize_log ✅ · diff_files ✅ · validate_file ✅

- [x] `bench/` fixtures + harness + RESULTS.md
- [x] `evals/` harness + 12 tasks · run 12/12 pass → evals/RESULTS.md
- [x] CHECKPOINT B — Phase 1 complete (2026-09-19); stopped for review.

## Post-checkpoint (2026-09-19, at Payton's request: "steer it toward agents")
- [x] Eval harness fixed: fixtures copied (symlinks outside cwd made Read fail permission → false results), same built-ins in every condition, **pass now requires a correct answer**.
- [x] Four-condition comparison (none / tools / snippet / hook) → `evals/COMPARISON.md`. Same answers everywhere; tools = ~20% tokens, ~50% time.
- [x] Read guard hook built + tested (`packages/context/hooks/read-guard.mjs`, bin `tiny-context-read-guard`, 4 tests). Did not fire in the comparison (agent reached for the tools directly).
- [x] `run_command` decision: yes, Phase 1.5 → `PROPOSALS.md` §2 (evidence table). Not built yet.
- [x] **Published to GitHub:** https://github.com/Warddamn/tiny-tools (public, topics set, CI green on macOS + Linux × Node 20/22/24 and the benchmark gate; Windows job is advisory; the latest pre-change run also passes).
- [x] Release prep (Phase 5 groundwork): CI workflow (`.github/workflows/ci.yml`), `scripts/set-owner.mjs` (one-command rename), `scripts/verify-install.mjs` (pack → install into a fresh project → CLI + MCP client + hook: **passes**), `packages/context/server.json`, `RELEASE.md` checklist.
- [x] Names settled 2026-09-19: GitHub **Warddamn**, npm org **tiny_tools_pw** (`tinytools` was taken), npm user **payton_n_ward**, author credit **AVRG3**. Packages are `@tiny_tools_pw/context` and `@tiny_tools_pw/shared`.
- [x] Discoverability (DISCOVERY.md, researched + verified): README fronts with install badges/one-liners/privacy · MCP server `instructions` + `alwaysLoad` gateway · registry `server.json` (≤100-char description) · npm keywords/description · `glama.json` · `llms.txt` · `AGENTS.md` · 18 GitHub topics · Claude Code plugin marketplace (`/plugin marketplace add Warddamn/tiny-tools`, validated) · workflows: `publish-mcp.yml` (on `context-v*` tags) and `traffic.yml` (daily snapshot) · `npm run stats`.
- [x] Official MCP Registry published via GitHub-hosted MCPB bundles and OIDC; npm is not a prerequisite. Glama public listing verified.
- [ ] Optional further distribution: npm, directory ownership claims and additional listings; see RELEASE.md for the current verified route.
- [ ] Next build: Payton to choose — spec order (Phase 2: images, pdf) or PROPOSALS §2 (`run_command`, recommended first). Open question: install ffmpeg/whisper/LibreOffice before Phase 3?

## Phase 2 — images, pdf ⬜
## Phase 3 — video, audio, verify, transcribe ⬜
## Phase 4 — bgremove ⬜
## Phase 5 — publish & discovery ⬜

## Adoption follow-through (2026-09-20)

- GitHub v0.1.0 is public; npm and official MCP Registry are still unpublished.
- Client commands, install badges and Claude Code plugin now use the published GitHub tarball. Plugin metadata is 0.1.1; the tool binary remains 0.1.0.
- QUICKSTART.md provides three tasks with checkable answers and selection/failure guidance.
- `verify:release` checks the public install using a fresh temporary npm cache and all eight MCP tools; CI runs this separately from source tests.
- No telemetry added. Download counters include our own verification runs. Private visitor/clone history requires TRAFFIC_TOKEN; public release counts can be archived without it.

Validation: `npm test` passes 107 tests; the public release install passes all eight tool checks on macOS with a fresh npm cache and empty npm config. Encoded install buttons and every documented client JSON config match the plugin command.

## Registry distribution (2026-09-21)

- [x] Build self-contained MCPB archives from locked production dependencies, one per OS with x64/arm64 bindings. macOS archive: about 77 MiB compressed / 249 MiB unpacked; larger than the tarball because dependencies are included.
- [x] Verify the extracted macOS archive outside the checkout with npm absent from PATH: all eight tools plus XLSX pass. Existing 107 tests pass.
- [x] Replace the npm-dependent registry workflow with bundle builds/tests for Windows, Linux and macOS, followed by GitHub release and OIDC registry publication.
- [x] Target the public copy at agent efficiency for logs, tables and document retrieval, with measured evidence and limits.
- [x] Hosted bundle builds and all eight tool checks pass on Linux/macOS/Windows; official registry is active (run 35621683385). Source CI also passes (35621684626).

Registry read-back verified active version 0.1.0 with three packages; every fileSha256 matches GitHub asset digests. Canonical server.json now contains that live metadata. Glama public page returned HTTP 200 with the expected title/description; its API requires authentication, so no API-based listing edits were made. No independent adoption claimed.
