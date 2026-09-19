# PROGRESS

Legend: ✅ done · 🔄 in progress · ⬜ not started · — n/a

## Phase 0 — Scaffold
- [ ] Workspaces, tsconfig, vitest wired
- [ ] `shared`: resolveInputs · outputPath · teach/toolError · ledger · detect · extractText (md/txt/code/pdf/docx/xlsx/pptx) · estimateTokens · timed
- [ ] `shared` unit tests green
- [ ] ENV.md · PROGRESS.md · DECISIONS.md
- [ ] Commit → CHECKPOINT A

## Phase 1 — `context` (flagship) + bench + evals
| Definition of Done item | context |
|---|---|
| Lib pure, typed, unit-tested on real fixtures | ⬜ |
| CLI: `--help`, exit codes, same zod schemas | ⬜ |
| MCP server on stdio; §4.2 descriptions; integration test (listTools + callTool per tool) | ⬜ |
| Teach-errors tested: missing input · bad format · existing output · missing binary · cap hit | ⬜ |
| Batch partial-failure tested | ⬜ |
| No raw contents/base64; responses bounded | ⬜ |
| Ledger/timing line on every response | ⬜ |
| docs/AGENT_USAGE.md; evals pass incl. negative case | ⬜ |
| Benchmark table generated + embedded in README | ⬜ |
| README complete (replaces · Size · benchmarks · CLI · MCP config · tool reference) | ⬜ |
| PROGRESS.md updated; committed | ⬜ |

Tools: file_map ⬜ · query_file ⬜ · read_section ⬜ · extract ⬜ · query_table ⬜ · summarize_log ⬜ · diff_files ⬜ · validate_file ⬜

- [ ] `bench/` fixtures + harness + RESULTS.md
- [ ] `evals/` harness + tasks + run
- [ ] CHECKPOINT B — stop for review

## Phase 2 — images, pdf ⬜
## Phase 3 — video, audio, verify, transcribe ⬜
## Phase 4 — bgremove ⬜
## Phase 5 — publish & discovery ⬜
