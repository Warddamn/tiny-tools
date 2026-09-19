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
- [ ] Publishing: waiting on Payton — GitHub name (Warddamn vs new AVRG3), npm scope (`@tinytools` org vs personal), `npm login`. Open questions: GitHub owner for `mcpName` (placeholder `OWNER`); install ffmpeg/whisper/LibreOffice before Phase 3?

## Phase 2 — images, pdf ⬜
## Phase 3 — video, audio, verify, transcribe ⬜
## Phase 4 — bgremove ⬜
## Phase 5 — publish & discovery ⬜
