# Honest comparison — the same 12 tasks in 4 conditions

_2026-09-22 · headless `claude -p` · model sonnet · every condition allows the same built-ins (Bash, Read, Grep, Glob) · max 12 turns._

- **none** — no tiny-context, no snippet (what an agent has today)
- **tools** — server attached, no snippet in CLAUDE.md (descriptions alone)
- **snippet** — server attached + the 6-line AGENT_USAGE snippet in CLAUDE.md (recommended install)
- **hook** — server attached + the Read guard hook (Read of PDF/Office/>20 KB files is intercepted and answered with an outline), no snippet

Cell = pass? / turns / total tokens processed (input + cache + output, all turns) / cost in USD. ✅ pass · ⚠️ correct answer but tool rules broken · ❌ wrong or no answer.

| Task | none: ok / turns / tokens / $ | tools: ok / turns / tokens / $ | snippet: ok / turns / tokens / $ | hook: ok / turns / tokens / $ |
|---|---|---|---|---|
| sales-by-region | ✅ / 5 / 205,289 / 0.21 | ✅ / 4 / 167,223 / 0.20 | ✅ / 4 / 168,774 / 0.10 | ✅ / 4 / 167,259 / 0.10 |
| negative-total | ✅ / 8 / 335,551 / 0.12 | ✅ / 3 / 124,719 / 0.06 | ✅ / 3 / 125,635 / 0.07 | ✅ / 3 / 124,539 / 0.06 |
| 5xx-spike | ❌ / 13 / 579,729 / 0.22 | ✅ / 3 / 124,649 / 0.07 | ✅ / 3 / 125,749 / 0.07 | ✅ / 3 / 124,687 / 0.07 |
| contract-termination | ✅ / 11 / 385,610 / 0.15 | ✅ / 3 / 128,123 / 0.08 | ✅ / 3 / 127,130 / 0.07 | ✅ / 3 / 128,144 / 0.08 |
| deck-pricing | ✅ / 10 / 368,398 / 0.16 | ✅ / 3 / 124,495 / 0.06 | ✅ / 4 / 168,197 / 0.08 | ✅ / 3 / 125,998 / 0.07 |
| handbook-outline | ✅ / 9 / 341,888 / 0.13 | ✅ / 2 / 82,677 / 0.06 | ✅ / 2 / 83,481 / 0.06 | ✅ / 2 / 82,677 / 0.06 |
| handbook-remote | ✅ / 11 / 437,305 / 0.21 | ✅ / 4 / 166,733 / 0.07 | ✅ / 4 / 168,008 / 0.08 | ✅ / 3 / 127,020 / 0.09 |
| callers | ✅ / 16 / 171,635 / 0.13 | ⚠️ / 9 / 128,024 / 0.09 | ⚠️ / 16 / 173,750 / 0.11 | ⚠️ / 16 / 174,787 / 0.12 |
| validate-json | ✅ / 8 / 369,821 / 0.20 | ✅ / 3 / 123,854 / 0.06 | ✅ / 3 / 124,854 / 0.06 | ✅ / 3 / 124,303 / 0.06 |
| emails | ✅ / 11 / 709,158 / 0.35 | ✅ / 4 / 169,380 / 0.08 | ✅ / 3 / 125,587 / 0.07 | ✅ / 4 / 125,943 / 0.07 |
| diff | ✅ / 12 / 561,410 / 0.28 | ✅ / 3 / 124,419 / 0.06 | ✅ / 3 / 125,560 / 0.07 | ✅ / 3 / 124,845 / 0.07 |
| negative-small-file | ✅ / 2 / 79,094 / 0.07 | ✅ / 2 / 81,594 / 0.05 | ✅ / 2 / 82,249 / 0.05 | ✅ / 2 / 81,787 / 0.05 |

| Condition | Pass / correct | Avg turns | Total tokens | Total cost | Total time |
|---|---|---:|---:|---:|---:|
| **none** | 11/12 pass · 11/12 correct | 9.7 | 4,544,888 | $2.23 | 246s |
| **tools** | 11/12 pass · 12/12 correct | 3.6 | 1,545,890 | $0.94 | 83s |
| **snippet** | 11/12 pass · 12/12 correct | 4.2 | 1,598,974 | $0.87 | 72s |
| **hook** | 11/12 pass · 12/12 correct | 4.1 | 1,511,989 | $0.88 | 90s |

## Interpretation of the 2026-09-22 safety-release run

All 36 tool-enabled task answers matched the fixture checks; all three small-text negative cases used Read only. The three code-caller cases used Grep and remain soft selection warnings, not incorrect answers. The no-server baseline matched 11/12 fixture checks. Answer checks are rule-based, not a claim of comprehensive semantic correctness.

The saved transcripts were regraded without new model calls after correcting a false positive: metadata-only `find`/`ls` operations had been counted as whole-file reads. A new regression suite covers this distinction; unknown shell commands remain conservatively flagged. Original transcripts retain their initial judgments locally. No tool results or timings were changed.

One run per task/condition, Claude Code 2.1.247 with the sonnet alias (claude-sonnet-5), local user skills/hooks available in all conditions, max 12 turns and $0.75/task. Tokens count processed input/cache/output, not separately billed uncached tokens. Baseline failures and extra tool turns remain visible. The generated source-tree fixture was refreshed during the baseline run; this affects the soft code-caller comparison, so do not treat its timing difference as a controlled result. Other data fixtures were unchanged. Runs are exploratory, not a clean-room or repeated statistical performance study. Historical results are archived separately; no universal efficiency claim is supported.
