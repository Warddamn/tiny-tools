# tiny-tools — notes for coding agents working in this repo

Read `AGENT_BUILD_SPEC.md` (the spec) and `PROGRESS.md` (where things stand) before changing anything. Log non-obvious choices in `DECISIONS.md` (one line: decision + why).

## Layout
- `packages/shared` — helpers every package uses (paths/globs, safe output naming, teach-errors, ledger, binary detection, `extractText` for md/txt/code/pdf/docx/pptx/xlsx).
- `packages/context` — flagship MCP server `tiny-context` (8 tools). `src/schemas.ts` holds params + descriptions (single source of truth), `src/tools.ts` the tool table that drives both `cli.ts` and `mcp.ts`, `src/lib/*` the pure logic.
- `packages/runtime` — separate three-tool server + SDK: resumable collection, measured-state repeat guard, progress/cache hints. Read its README for source/engine contracts.
- `bench/` — fixture generator + benchmark harness → `bench/RESULTS.md` (embedded into READMEs between `<!-- bench:start/end -->` markers).
- `evals/` — tool-selection evals via headless `claude -p` (needs the CLI logged in).

## Commands
```bash
npm test            # tsc -b, then vitest (unit + MCP stdio integration + CLI)
npm run bench       # generates fixtures, runs tasks, updates RESULTS.md + READMEs
npm run evals       # runs evals/tasks/context.json through claude -p
```

## Rules that must hold (from the spec, §3)
- Logic lives in `src/lib`; CLI and MCP handlers only validate → call → format. No `console.log` in lib; MCP logs to stderr only.
- Never overwrite an input; auto-suffix `-1`, `-2` on collisions. Absolute paths in responses.
- Every error is a teach-error: what went wrong + what to do next.
- Every response is bounded (≤ ~16 KB); file-reading tools use a savings ledger and runtime tools use a files/timing line. Do not invent token savings for deterministic orchestration.
- Tool descriptions follow the template: one sentence · USE WHEN · PREFER OVER (and when the built-in is fine) · DOES NOT · EXAMPLE · RETURNS. Every param `.describe()` states default + example.
- ≤ 8 tools per server. Tests gate progress — never weaken a test to pass. If an eval fails, fix the description/snippet, not the eval.
- Every source file carries the author signature `@author AVRG3` (a single comment line). `npm run sign` adds it to new files; `npm test` refuses to run if any file lacks it.
- Commit per package at Definition of Done (conventional commits, e.g. `feat(images): resize_images`).
