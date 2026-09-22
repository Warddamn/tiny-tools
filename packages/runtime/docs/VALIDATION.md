# Validation — 2026-09-21

Local environment: macOS ARM64, Node 24.16.0. All examples and fixtures are synthetic. No company data was used.

- `npm test`: **161 tests in 19 files passed**. This includes the original 107 tests and 54 new tests for collector recovery/limits, guard behavior, progress planning, real HTTP adapters, CLI and MCP stdio.
- `npm run demo:runtime`: collected 200 records from four pages with zero model calls inside the workflow; exact 2,000-cent sum. A synthetic loop executed three calls and blocked seven, then allowed a call after a state change. Cache hints reached an in-memory reference adapter; no GPU was involved.
- `node scripts/verify-runtime-install.mjs`: packed and installed the package outside the checkout, with a blank npm user config; CLI and all three MCP tools passed. No dependency on an unpublished shared package. Verification snapshot: 37,524-byte tarball, 142,840 unpacked package bytes, 17,459,429 production-install file bytes including dependencies (final documentation changes can slightly increase package size).
- Five live Claude Code selection/answer tasks passed: collection, resumption, guard decision, cache planning, and a small-note negative case using Read only. The initial resumption trial read the checkpoint unnecessarily; guidance was corrected, and the targeted repeat used only ToolSearch → collect_pages. [Recorded results](EVAL_RESULTS.json). Total reported API-equivalent cost for the six calls, including the repeat, was about $0.55. This is a small smoke evaluation, not a model-performance comparison.
- `npm run bench:runtime`: five runs, 10,000 rows in 100 pages, exact 495,000-cent sum in both implementations. Plain correct script: 0.46–1.07 ms; collector: 30.68–39.62 ms. Disk checkpoint I/O and network delay excluded. The collector adds validation overhead; no claim of speed superiority to a correct existing script.
- Source signature check and `git diff --check` passed. Every added code file carries `@author AVRG3`.

Run `npm test`, `npm run demo:runtime`, `npm run bench:runtime`, and `npm run verify:runtime` to reproduce deterministic checks. `npm run evals:runtime` is optional and invokes an authenticated Claude CLI with a $0.50 per-task cap; it is never run automatically in CI.

Remaining integration limits: no production inference-engine patch or GPU deployment; hosted-model KV cache is not controlled; repeat guards rely on trusted and sufficiently complete state fingerprints; collection completeness depends on the configured source's contract. No independent adoption, token savings, real-world compute savings, or universal loop prevention is established. Cross-platform release verification is recorded separately below.


## Public release verification — 2026-09-22

[Publication run 35686387287](https://github.com/Warddamn/tiny-tools/actions/runs/35686387287) passed at source commit `95301ed2402c0a07230adde13b5b55531b22e62a`. The build ran all 161 tests. Linux, macOS and Windows then extracted the same portable MCPB outside the checkout and verified CLI help plus all three MCP tools with npm absent from the server PATH. The published npx command was checked with a new cache, blank npm configs and synthetic tasks for all three tools. Individual client installation screens were not exercised.

[Public version 0.1.0](https://github.com/Warddamn/tiny-tools/releases/tag/runtime-v0.1.0) contains a 3,930,700-byte MCPB and a 41,830-byte tarball. Official registry read-back returned active `io.github.Warddamn/tiny-runtime@0.1.0`; its archive URL and SHA-256 match the release digest and checksum file. The MCPB includes production dependencies; Node.js 20+ is supplied by the host. The smaller tarball downloads dependencies. No npm account is required. This verifies distribution and tool behavior, not adoption or general performance savings.

## Safety/efficiency regression run — 2026-09-22, version 0.1.1

New tests cover SQL write/external-access rejection, exclusive exports and deadlines, repeated successful reads, callback hangs, a cancellation/commit race, journal recovery/tampering, duplicate/expired/late cache hints, and parse-cache freshness, mutation isolation and eviction. Exact downloaded artifacts also run SQL/guard regression checks.

`npm run bench:safety` compares the compatible legacy snapshot callback with the new default incremental journal, including final checkpoint and records export. Three runs on macOS ARM64 / Node 24.16.0: 100 pages / 10,000 records wrote **58,755,941 → 3,416,157 bytes** (94.2% less); median **630.82 → 96.30 ms**. At 200 pages / 20,000 records: **230,089,741 → 6,866,057 bytes** (97.0% less); median **2453.61 → 208.87 ms**. Fifty identical cache ticks produced one adapter call. [Raw measurements](SAFETY-BENCH.json).

The regression gate compares bytes, not wall-clock speed. Journaling makes more small writes; slow filesystems may have different timing. A plain script with no persistence still does less work. These measurements establish neither universal token savings nor GPU savings. Custom callbacks must cooperate with cancellation; synchronous blocking code and filesystem cleanup can exceed a collection deadline.

Local validation: **196 tests passed** in 23 files. All five fresh runtime agent selection/answer tasks passed, including the small-note non-use case; [results](SAFETY-EVAL.json). This is a smoke evaluation, not a savings comparison.

## Public safety release verified — 0.1.1

[Runtime publication 35697960674](https://github.com/Warddamn/tiny-tools/actions/runs/35697960674) succeeded at source `1c8c980dc1fe1326e5828f7e147150fb863a6365`. The exact portable archive passed on macOS, Windows and Linux; fresh public installs passed on Linux and macOS, including successful unchanged-read guard checks. Public assets: **3,937,431-byte MCPB**, **49,413-byte tarball**. Active official registry version/URL/hash, downloaded server.json checksum, and GitHub asset digest all match. These verification downloads are automated events, not adoption evidence.
