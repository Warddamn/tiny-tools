# Proposals after Checkpoint B (2026-09-19)

Written after Phase 1 shipped, in answer to "is this built for humans or for agents?". Evidence first, then decisions.

## 1. Agent-native delivery: the Read guard hook — built

**Problem.** As shipped, tiny-context is a toolbox: on every file the agent must *choose* between its built-in Read and our tools. Choosing costs a turn (the eval transcripts show size checks via `ls -l` before deciding) and depends on a snippet being present in `CLAUDE.md`.

**Change.** A Claude Code PreToolUse hook (`packages/context/hooks/read-guard.mjs`, bin `tiny-context-read-guard`) intercepts Read on PDF/DOCX/PPTX/XLSX or any text file over 20 KB, denies it, and returns the file's outline (`file_map`) plus the exact follow-up calls. Reads with `offset`/`limit`, small files, images and anything that errors inside the hook pass straight through. No snippet needed; the smart path is the default path.

**Evidence.** `evals/COMPARISON.md` runs the same 12 tasks in four conditions (no tools · tools only · tools + snippet · tools + hook, no snippet), same built-ins allowed in each, pass = correct answer *and* the large file never read raw.

<!-- comparison:start -->
| Condition | Correct | Pass | Avg turns | Total tokens | Total cost | Total time |
|---|---|---|---:|---:|---:|---:|
| **none** — no tiny-context, no snippet (Bash/Read/Grep/Glob only) | 12/12 | 12/12 | 4.3 | 1,488,617 | $2.41 | 193s |
| **tools** — server attached, no snippet | 12/12 | 11/12* | 3.8 | 1,192,953 | $2.02 | 104s |
| **snippet** — server + AGENT_USAGE snippet | 12/12 | 11/12* | 3.5 | 1,186,570 | $1.95 | 97s |
| **hook** — server + Read guard, no snippet | 12/12 | 11/12* | 3.9 | 1,248,524 | $2.04 | 144s |

\* the single "fail" in each tools condition is `callers` ("which functions call resolveInputs"), where the agent chose Grep across the source tree — which *is* the right call and is what the descriptions say; the task is marked soft.

**Honest reading (2026-09-19, 12 tasks × 4 conditions, headless Claude Code):**
- **Correctness is a wash.** A capable agent with a shell got every answer without tiny-context: it wrote `awk`/`python`/`unzip -p` one-liners for the CSV, the log and even the DOCX/PPTX.
- **What the tools buy against that baseline: ~20% fewer tokens, ~19% lower cost, ~50% less wall-clock, 4.3 → 3.5 turns.** The saving is *fewer probing turns*, not smaller file reads: every turn here carries ~24k tokens of fixed context (system prompt, tool list, CLAUDE.md), so turn count is the lever.
- **The benchmark's 99.9% is real only against reading whole files** — the situation for agents *without* a shell (chat clients, restricted hosts, Read-only MCP setups), and for files they cannot open at all. Against a shell-capable coding agent the honest number is the one above.
- **The Read guard hook never fired.** With the tools visible, the agent went to them directly and never attempted a raw Read of a big or binary file. The hook is insurance for setups where Read *would* be tried; it produced no measured saving here and cost a little time (process spawn per Read).
- **Roadmap consequence:** reducing turns is the prize. `run_command` (one turn instead of a probe loop, §2) stays the top recommendation; the hook is kept, documented, and not oversold.
<!-- comparison:end -->

## 2. `run_command` — decision: **yes, build it as Phase 1.5, before Phase 2**

**Problem.** For coding agents the biggest context hog is not documents; it is the output of commands they run: test suites, builds, diffs, listings, dependency trees. Every line enters context whether or not it mattered.

**Measured** on this repo (tokens ≈ bytes/4):

| Command output | Lines | Raw tokens | `tail -40` | `summarize_log` clusters | The right digest |
|---|---:|---:|---:|---:|---|
| `git diff` over 5 commits | 3,062 | 35,472 | 397 | 259 | per-file ± counts + hunk locations (as `diff_files` does) |
| `ls -laR` of three source trees | 968 | 14,718 | 508 | 359 | tree with counts (as `file_map` does) |
| `git log --stat -n 30` | 329 | 4,225 | 534 | 272 | one line per commit |
| `npm ls --all` | 333 | 3,298 | 529 | 276 | top-level deps only |
| failing `vitest run` (3 of 9 fail) | 74 | 439 | 226 | 250 **and loses the assertion diff** | pass through unchanged |
| `npm install` (dry run) | 27 | 293 | — | — | pass through unchanged |

Two lessons the numbers force:
1. **Never touch output that is already compact** (< ~1.5 KB). Clustering a small test report destroys the one thing the agent needs — the assertion diff. Savings come from the long outputs (89–99% above), and they are common: diffs, listings, verbose test runs with hundreds of cases, build logs, package installs.
2. **The digest must be type-aware**, not one generic summariser: test runners → the summary line plus every failure block verbatim (capped); compilers/linters → deduped `file:line: message` lines; diffs → per-file ± with hunk locations; listings → counted tree; everything else → head + tail + repeated-line clusters. Any line matching error/fail/exception is always kept verbatim (capped), so a digest can never hide a failure.

**Design.** One tool, its own small server (rule 12: ≤ 8 tools per server, one domain per server; `context` already has 8):

`run_command({ command, cwd?, timeout_s? (300), digest? ("auto" | "tests" | "build" | "diff" | "list" | "raw"), max_tokens? (1500) })`
→ `exit 1 · 4.2s · 3,062 lines · full log: ~/.cache/tiny-tools/runs/2026-09-19T12-30-01-npm-test.log` + digest + ledger. The full log is always saved, so `read_section`, `extract` and `summarize_log` can drill in without re-running. Permissions stay with the host: this is a pass-through runner with a digest, nothing more.

**Agent-native delivery**, same idea as §1: a Claude Code PreToolUse hook on Bash that, for commands matching test/build/diff/list patterns, rewrites the command to run through `tiny-run exec -- <command>` (via `updatedInput`), so the Bash tool result *is* the digest. Agents that ignore MCP still benefit.

**Cost/benefit.** Reuses the clustering, diff-hunk and tree code that already exists; new work is the test/compiler line parsers (vitest/jest/pytest/go test/cargo/tsc/eslint). About a day of agent time. Higher value for coding agents than the `images`/`pdf` packages, hence the ordering.

## 3. Smaller agent-native improvements (queued)

- **Content-hash cache** for `extractText`/`file_map`: after context compaction agents re-read the same files; a cached map makes the second look free. Stays deterministic (same content → same output).
- **Ledger line opt-out** (`TINY_TOOLS_LEDGER=0`) for agent-only deployments: it is a human-facing sales line (~25 tokens per response). Keep it on by default — humans decide what gets installed.
- **`structuredContent`** alongside text in MCP responses so agents can chain calls without parsing prose.
- **Read guard for Grep/Glob outputs** is unnecessary — those are already bounded by the host.
