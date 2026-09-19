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
| docs/AGENT_USAGE.md; evals pass incl. negative case | 🔄 snippet written; evals harness written, run pending |
| Benchmark table generated + embedded in README | 🔄 harness written, run pending |
| README complete (replaces · Size · benchmarks · CLI · MCP config · tool reference) | 🔄 written; bench/size numbers embed on `npm run bench` |
| PROGRESS.md updated; committed | 🔄 |

Tools: file_map ✅ · query_file ✅ · read_section ✅ · extract ✅ · query_table ✅ · summarize_log ✅ · diff_files ✅ · validate_file ✅

- [ ] `bench/` fixtures + harness + RESULTS.md (harness written)
- [ ] `evals/` harness + tasks + run (harness + 12 tasks written)
- [ ] CHECKPOINT B — stop for review

## Phase 2 — images, pdf ⬜
## Phase 3 — video, audio, verify, transcribe ⬜
## Phase 4 — bgremove ⬜
## Phase 5 — publish & discovery ⬜
