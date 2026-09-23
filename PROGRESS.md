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
- [x] Next build chosen 2026-09-21: Payton requested all three runtime efficiency helpers; see the implementation checkpoint below. Media packages and run_command remain separate future work.

## Phase 2 — images, pdf ⬜
## Phase 3 — video, audio, verify, transcribe ⬜
## Phase 4 — bgremove ⬜
## Phase 5 — publish & discovery ⬜

## Adoption follow-through (2026-09-20)

- As of this 2026-09-20 checkpoint, GitHub v0.1.0 was public; official MCP Registry publication followed on 2026-09-21 (below). npm remains optional and unpublished.
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

## Runtime efficiency helpers (2026-09-21)

User instruction: **“BUILD ALL THREE PLEASE.”** New separate package: `packages/runtime` / `tiny-runtime`; existing tiny-context release remains unchanged.

- [x] Resumable collector with explicit complete/partial/failed status, exact integer aggregation, duplicate/conflict detection, source consistency checks, request/record/byte/time caps, and immutable resume inputs.
- [x] Measured-state repeat guard with before-call enforcement, bounded hashed history, changed-state retry allowance, cycle checks, scope isolation and explicit polling exemptions.
- [x] Progress reporter, conservative parallel-call-aware cache planner, expiring leases, live bridge and explicit HTTP engine-adapter contract. Reporter/controller side implemented; a compatible serving engine is still required for GPU effect.
- [x] Typed SDK, thin CLI and separate three-tool MCP server; bounded summaries with paths/timing and teach errors.
- [x] 54 new tests plus 107 existing tests pass locally. Actual local HTTP, CLI and MCP integration covered. Synthetic demo and honest correct-script benchmark run.
- [x] Fresh tarball installation outside the repository passes CLI and all three tools; production install about 17.5 MB.
- [x] Five live agent selection/correctness tasks pass, including built-in Read for a small note. Resume guidance corrected to avoid loading checkpoint rows into context; targeted repeat passed.
- [x] Usage snippet, README, validation/eval results, AVRG3 signatures, CI install/demo gate and benchmark/eval commands.
- [x] Public runtime publication authorized 2026-09-22: portable MCPB + npx tarball builder, three-OS verification and OIDC registry workflow implemented. Local archive and install-link checks pass.
- [x] Public runtime release and active registry version 0.1.0 verified on 2026-09-22. No production GPU or independent adoption claim.

## Runtime public installation and discovery (2026-09-22)

- [x] Task-based descriptions and keywords: resumable API pagination, batch checkpoints, repeated failures and tool-progress cache hints. AVRG3 credit preserved.
- [x] Public npx/MCPB install instructions, validated Cursor/VS Code payloads, three worked examples, optional Claude Code plugin and llms.txt discovery text.
- [x] Existing 161 tests pass. Actual local portable MCPB passed three MCP tools + CLI outside the checkout, without npm on the server PATH. Plugin/marketplace strict validation passed.
- [x] Publish workflow tests one exact portable bundle on Linux/macOS/Windows, preserves immutable release assets, verifies public npx installation with fresh cache, and checks exact active registry version/hash.
- [x] PR #1 merged at `95301ed`; [publication run 35686387287](https://github.com/Warddamn/tiny-tools/actions/runs/35686387287) passed every job. The same portable archive passed on Linux, macOS and Windows; the published npx install passed with a fresh cache.
- [x] [runtime-v0.1.0](https://github.com/Warddamn/tiny-tools/releases/tag/runtime-v0.1.0) is public. Official MCP Registry read-back confirms active `io.github.Warddamn/tiny-runtime@0.1.0` with the exact download URL/hash. `packages/runtime/server.json` contains the published metadata.
- [x] Published artifacts: MCPB 3,930,700 bytes, SHA-256 `cf98d46dd9b312b8bdc95407481a2b7184fbab8d2cffc2f30163776e45daa3c1`; tarball 41,830 bytes, SHA-256 `38e69adb78efac2406ee318cab2fa07f3d157057cd9aede15e9c981669e7a9f2`. Registry, release asset digests and release checksums agree. No npm login is required.


## 2026-09-22 — safety and efficiency patch prepared

Payton requested full testing, fixes and a public update. Prepared context/runtime 0.1.1: restricted SQL worker and protected exports; bounded freshness-checked parse reuse and direct routing; incremental journal recovery, correct successful-read guard handling, callback deadlines, and coalesced expiring cache hints. Added installed-artifact regressions and a synthetic disk-I/O gate. AVRG3 attribution retained; no company data, telemetry or new model dependency. Publication/registry verification must complete before marking this shipped.

Validation follow-up: 196 tests passed locally; first cross-platform CI run passed all 10 jobs. Clean context tarball and both local MCPBs pass installed safety tests. All 36 tool-enabled context agent answers and five runtime agent tasks pass expected-answer checks; code-caller builtin choices remain soft selection warnings. Fixed metadata-only shell-command grading and regraded the same transcripts. Historical marketing numbers now explicitly refer to archived results.


## 2026-09-22 — context/runtime 0.1.1 SHIPPED

Safety PR #2 merged at `1c8c980dc1fe1326e5828f7e147150fb863a6365`; 196 tests and all ten CI jobs passed. Public GitHub releases `context-v0.1.1` and `runtime-v0.1.1` are live. Publication runs 35697958286 and 35697960674 passed exact-artifact checks on macOS/Windows/Linux, fresh public installs, and official MCP Registry read-back. Both registry entries are active at 0.1.1 with matching public artifact hashes. Mac fresh-cache npx checks independently passed all eleven tools and installed SQL/guard regressions. New configs/buttons/plugins use fixed releases; old release notes point to upgrades, with immutable old assets preserved. Published server.json metadata recorded. No npm login, new account, company data, telemetry or user action was needed to publish. Existing pinned installations must upgrade explicitly. No universal time/token/GPU saving claimed; benchmark/evaluation limits remain documented.

## 2026-09-23 — task-based discovery and directory inspection

Payton requested that agents looking for these capabilities can find them. Added a task guide, a machine-readable catalog generated from the actual 8+3 MCP tools, and copyable pinned release config. READMEs and llms.txt link directly to them; current discovery status replaces obsolete npm prerequisites. Only the two available products are listed as available.

Glama's profile existed but had no inspected capabilities and could not deploy. Added an explicit non-root Docker build for tiny-context (default) and tiny-runtime (separate target), with CI that checks catalog drift and calls all eleven tools without container network access. This addresses build ambiguity without claiming to know Glama's failure cause. Directory reinspection/search placement remains external; no independent adoption claim. Runtime code and immutable 0.1.1 releases unchanged. Local dashboard work stays outside this public update.

Local validation: 196 tests across 23 files passed; actual MCP catalog/config checks, local documentation links and 102 source signatures passed. Docker is not installed on the maintainer's Mac; Linux CI verifies the container builds and all eleven tool calls before merge.
