# DECISIONS — one line each: decision + why

- **Repo location:** `~/Desktop/pw papps/tiny-tools` (sibling of the other apps) — the session's cwd was the VR rug project, wrong home for a new monorepo.
- **Package naming:** `@tiny_tools_pw/<name>` scope for every package — `tiny-context`, `tiny-images`, `tiny-audio`, `tiny-context-mcp` are taken on npm (§13 fallback). Bins remain `tiny-<name>` / `tiny-<name>-mcp`.
- **TypeScript 5.9, not 7.0:** TS 7 (the native port) shipped recently; staying on 5.x avoids tooling surprises. Easy to bump later.
- **zod 4:** MCP SDK 1.30 peer-accepts `^3.25 || ^4`; new code starts on 4.
- **Glob expansion hand-rolled** (`*`, `**`, `?`, `{a,b}`, `[…]`): ~60 lines vs a 1 MB fast-glob dependency. Tiny is the product.
- **OOXML (docx/pptx/xlsx) parsed with regex over the XML** after `fflate` unzip — no XML-parser dependency; the formats are regular enough and we only need text + structure.
- **PDF text via `unpdf`** (pdf.js wrapper, ESM, lazy-loaded) — `pdf-lib` writes PDFs but cannot extract text.
- **DuckDB is an `optionalDependency`, lazy-imported** — native binary; install failures on exotic platforms must not break the rest of `context`. Missing → teach-error with the install command.
- **XLSX → DuckDB goes through the shared xlsx→CSV extractor** (temp file) rather than DuckDB's `excel` extension — the extension needs a network download on first use; local-first wins.
- **`extract.jq`:** use system `jq` when on PATH (macOS ships it); otherwise a tiny path subset (`.a.b`, `.items[]`, `.items[2].name`, `keys`, `length`). Documented in DOES NOT.
- **`diff_files` line diff is a hand-rolled Myers O(ND)** — ~80 lines vs the `diff` package.
- **`validate_file` lazy-loads `yaml`, `ajv`, `fast-xml-parser`** only for the check that needs them; JSON/CSV/markdown/HTML checks are dependency-free.
- **Token estimate = bytes/4** everywhere (spec rule 11); the ledger says "≈".
- **`mcpName` owner placeholder:** `io.github.warddamn/…` until the GitHub org/user for publishing is confirmed (Phase 5).
- **Ledger "raw" for binary documents = extracted-text bytes,** not file bytes — the honest naive alternative for a PDF/DOCX is "convert and read the text"; for directories it's a full recursive listing, not the files' contents.
- **`summarize_log` "errors" focus:** `5xx` counts only after `status`/`HTTP/1.1"` — bare 3-digit numbers (user ids, item ids) were false positives.
- **`extract` with every input skipped throws** (teach-error listing each reason); partial failure reports `skipped:` and continues (rule 8).
- **Bench source-tree fixture = a snapshot of this repo's own `src/`** (MIT) instead of vendoring a third-party project — no network, still a realistic mid-size TypeScript tree; regenerated on each bench run.
- **Evals need the local `claude` CLI logged in;** the runner detects "OAuth session expired" and stops with the fix instead of recording false failures. `CLAUDECODE` is unset when spawning so it can run from inside a Claude Code session.
- **Durations under 100 ms print as `NNms`** (spec example `0.4s` still holds above that) — `0.0s` hid real timings; percentages print two decimals only when one would round to 100.0.
- **Formatting glyphs:** the log timeline uses `#` bars (ASCII) so responses survive any terminal/font.
- **Negative eval fix (11/12 → 12/12):** the agent Read a 2 KB file and then also called `query_file` on it. Fixed in wording only — snippet + `query_file`/`file_map` PREFER OVER now say a file you have already read needs no further tool call. 3/3 stable afterwards.
- **Author credit = `AVRG3`** (Payton's handle) everywhere: `@author AVRG3` comment line in every source file (enforced by `scripts/sign.mjs --check` in `npm test`), `author` in every package.json, LICENSE holder, README footers, git author on all commits, and `mcpName` `io.github.warddamn/...` (assumes AVRG3 is also the GitHub username — confirm before publishing).
- **Eval "pass" requires a correct answer** (regex expectations per task). The earlier 12/12 counted a hollow pass: symlinked fixtures outside the workspace made Read a permission failure. Fixtures are now copied; every condition allows the same built-ins.
- **Honest baseline = a shell-capable agent, not "read the whole file".** Comparison shows identical correctness and ~20% token / ~50% time savings from tiny-context; the README now says so next to the 99.9% figure.
- **`callers` stays soft:** Grep across a source tree is the right tool for "who calls X"; the descriptions say so, and the agent agreed in all four conditions.
- **Read guard hook shipped but not oversold:** it never fired when the MCP tools were visible; it is insurance for hosts where Read would be attempted.
- **Discoverability (see DISCOVERY.md):** usage of a local no-telemetry server is unmeasurable by design; proxies are npm downloads, GitHub traffic, directory estimates → `npm run stats`. Registry `description` must be ≤ 100 chars (schema cap) — shortened. Added MCP server `instructions` (Claude Code loads only tool names + instructions at session start) and `anthropic/alwaysLoad` on `file_map` only (one always-visible gateway tool). npm keywords/description rewritten for keyword search (npm search has no popularity weighting). `AGENTS.md` = copy of `CLAUDE.md` (open format read by other agent tools); GitHub topics expanded to 18.
- **Known gap:** `scripts/set-owner.mjs` does not rewrite URL-encoded scope forms (`%40tiny_tools_pw%2Fcontext`) inside badge/deeplink URLs; if the npm scope ever changes, regenerate the README badge row by hand.

- **2026-09-20 — publish a working route before expanding discovery:** all active install instructions and the plugin use the pinned GitHub v0.1.0 tarball; npm and the official MCP Registry remain future distribution channels. `verify:release` exercises the same command from a fresh cache.
- **2026-09-20 — adoption evidence:** worked tasks with expected answers and correct tool selection are more useful than maximizing call counts; tiny plain text should still use built-ins. No telemetry added.
- **2026-09-20 — counter history:** save public release counters with the existing Actions token; represent unavailable private traffic as null/not_configured, never zero. Automated install tests also download the release.

- **2026-09-21 — registry distribution without npm:** use real GitHub-hosted MCPB bundles and GitHub Actions OIDC. Bundle locked production dependencies, including both CPU architectures for each OS; keep the smaller npx tarball route for other clients. Build-only MCPB packer is pinned to @anthropic-ai/mcpb@2.1.2; official publisher v1.8.1 is checksum-verified. No runtime dependency added to the existing tools.
- **2026-09-21 — searchable positioning:** lead with log diagnosis, SQL over spreadsheets and targeted PDF/Office retrieval; use the measured 7-to-3-turn log example with its single-trial limit. Match the registry namespace to the GitHub OIDC owner casing, io.github.Warddamn/tiny-context.

- **2026-09-21 — user authorized “BUILD ALL THREE PLEASE”:** build the researched collector, progress-aware repeat guard, and tool-progress/cache bridge in `packages/runtime`, ahead of the older media roadmap. Keep tiny-context's existing eight-tool server/release separate.
- **2026-09-21 — integrate into hosts, not model bookkeeping:** expose reusable SDK functions plus CLI/MCP trace tools; actual interception/cache application uses the SDK. Missing state evidence yields advice, not an enforced block.
- **2026-09-21 — explicit I/O exception for the new runtime scope:** remote paginated reads are opt-in GET requests to a supplied endpoint, no redirects or automatic retries; bearer credentials stay in host environment. Core processing remains deterministic with no models/telemetry. Existing tiny-context network behavior is unchanged.
- **2026-09-21 — completeness is a source contract:** only explicit terminal cursors plus configured consistency checks permit complete; snapshots, totals, limits, conflicting IDs and errors stay visible. Checkpoints are explicit bounded state, not hidden sessions.
- **2026-09-21 — cache integration boundary:** implement instrumented progress, conservative ETA, bounded/expiring hints and an explicit HTTP adapter contract. Do not claim a stock vLLM patch, hosted-model control, GPU gains or the research paper's measured savings.
- **2026-09-21 — no unnecessary dependency chain:** runtime uses the already-present Zod/MCP SDK/Commander, without shared's document parsers or DuckDB. New package's production install is about 17.5 MB including transitive dependencies.

- **2026-09-22 — progress notification integration test:** SDK 1.30 queues notification callbacks but removes onprogress handlers synchronously when a result shares the stdio chunk, dropping a final callback. Verify both actual protocol notifications with ProgressNotificationSchema; do not loosen the required page updates or add arbitrary timing sleeps. Final collection results remain authoritative.

- **2026-09-22 — public runtime install authorized:** publish a separate runtime-v0.1.0 GitHub release with a small npx tarball, one portable locked-dependency MCPB tested on three OSes, and an official registry listing using existing GitHub OIDC. No npm token/login flow.
- **2026-09-22 — runtime discovery:** use task phrases (resumable API pagination, batch checkpoints, repeated failures, progress/cache hints), verified installation payloads, worked examples and a Claude Code plugin. Keep SDK integration limits visible; no ranking, adoption or savings guarantees.
