# Validation — 2026-09-21

Local environment: macOS ARM64, Node 24.16.0. All examples and fixtures are synthetic. No company data was used.

- `npm test`: **161 tests in 19 files passed**. This includes the original 107 tests and 54 new tests for collector recovery/limits, guard behavior, progress planning, real HTTP adapters, CLI and MCP stdio.
- `npm run demo:runtime`: collected 200 records from four pages with zero model calls inside the workflow; exact 2,000-cent sum. A synthetic loop executed three calls and blocked seven, then allowed a call after a state change. Cache hints reached an in-memory reference adapter; no GPU was involved.
- `node scripts/verify-runtime-install.mjs`: packed and installed the package outside the checkout, with a blank npm user config; CLI and all three MCP tools passed. No dependency on an unpublished shared package. Verification snapshot: 37,524-byte tarball, 142,840 unpacked package bytes, 17,459,429 production-install file bytes including dependencies (final documentation changes can slightly increase package size).
- Five live Claude Code selection/answer tasks passed: collection, resumption, guard decision, cache planning, and a small-note negative case using Read only. The initial resumption trial read the checkpoint unnecessarily; guidance was corrected, and the targeted repeat used only ToolSearch → collect_pages. [Recorded results](EVAL_RESULTS.json). Total reported API-equivalent cost for the six calls, including the repeat, was about $0.55. This is a small smoke evaluation, not a model-performance comparison.
- `npm run bench:runtime`: five runs, 10,000 rows in 100 pages, exact 495,000-cent sum in both implementations. Plain correct script: 0.46–1.07 ms; collector: 30.68–39.62 ms. Disk checkpoint I/O and network delay excluded. The collector adds validation overhead; no claim of speed superiority to a correct existing script.
- Source signature check and `git diff --check` passed. Every added code file carries `@author AVRG3`.

Run `npm test`, `npm run demo:runtime`, `npm run bench:runtime`, and `npm run verify:runtime` to reproduce deterministic checks. `npm run evals:runtime` is optional and invokes an authenticated Claude CLI with a $0.50 per-task cap; it is never run automatically in CI.

Remaining integration limits: no production inference-engine patch or GPU deployment; hosted-model KV cache is not controlled; repeat guards rely on trusted and sufficiently complete state fingerprints; collection completeness depends on the configured source's contract. No independent adoption, token savings, real-world compute savings, or universal loop prevention is established. GitHub CI results are available on the pull request; no cross-platform pass is inferred from these local checks.
