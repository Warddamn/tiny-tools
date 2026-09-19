# bench — proving the savings

`npm run bench` generates deterministic fixtures (100k-row CSV, 50k-line log with two injected 5xx bursts, a 100-page text-heavy PDF, a ~40-page DOCX and a v2 with a few edits, and a snapshot of this repo's own sources as a mid-size tree), runs every `context` tool on realistic tasks, and writes `RESULTS.md`. The table is also embedded between the `<!-- bench:start -->` markers in `packages/context/README.md` and the root README.

Large fixtures are gitignored (`fixtures/large/`); the small ones in `fixtures/small/` are committed and used by the evals.

Measurement: **naive** = tokens (bytes/4) to read the raw content the task needs; **tool** = tokens of the tool's full response. Runtime is wall-clock per call, in-process.
