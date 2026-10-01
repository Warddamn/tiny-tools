# Keyed snapshot agent checks — September 30, 2026

Actual headless Claude Code / Sonnet runs on generated 5,000-record exports; no company data. Same workspace fixtures and permitted Read/Grep/Glob/Bash tools in both conditions. The tool condition additionally received tiny-context and a short routing instruction. Eight-turn / $0.60 limits per run. No transcript persistence in Claude; local raw test transcripts were captured by the harness.

| Task | With tiny-context | Built-ins only | Tool time / baseline time | Tool cost / baseline cost |
|---|---|---|---:|---:|
| Three changed order statuses, timestamp noise excluded | Correct; records mode | Correct; script after file probes | 9.87s / 28.09s | $0.172 / $0.129 |
| Reordered but unchanged export, explicit integer counts | Correct; records mode | Correct; script after file probes | 13.01s / 17.87s | $0.106 / $0.102 |
| Duplicate identity prevents reliable keyed comparison | Correct refusal | Not run | 19.02s / — | $0.102 / — |
| Small plain-text note | Correct; Read, no tiny-context call | Not run | 8.28s / — | $0.057 / — |

Costs above are Claude-reported inference estimates, not an invoice or proof of additional subscription charges. These are single trials, not reliable estimates of average savings. The new tool was quicker on these two paired tasks, but **cost more in both**. Prompt/cache state, sequential run order, model variance, startup and routing guidance confound inference; do not advertise these as general time or cost reductions. Token usage is recorded in the raw result JSON, including cached tokens. The deterministic operation itself makes no model calls.

The agent made an unnecessary `file_map` call in the reordered task even after instructions were clarified. Direct comparison needs no outline. This is a remaining selection inefficiency, not hidden or graded away. The built-in condition attempted whole-file reads; it still got the right answer. Those attempts are reported as a behavior metric, not an answer failure.

## Initial test and targeted correction

The initial reordered prompt said “Return JSON containing changed, unchanged, added, removed” without specifying the data type. Both conditions returned empty arrays for changed/added/removed, accurately communicating no changes, but failed the integer-only grading contract. The prompt was corrected to explicitly request integer record counts; only that paired task was repeated. Expected counts did not change. No agent answer was fabricated or normalized into a passing result.

The initial runner also incorrectly treated the built-in condition's full-file read attempt as a failing selection gate. That gate is appropriate only for the tool condition; the baseline's answer correctness is now graded independently. Original machine results remain in [RECORDS-initial.json](RECORDS-initial.json); targeted repeats are in [RECORDS-targeted.json](RECORDS-targeted.json). The original complete run is also preserved in [RECORDS.json](RECORDS.json), including initial status flags. Those flags require the interpretation above.

## Reproduce

`npm run evals:records` runs the four tool checks and two built-in comparisons, with the clarified prompt and corrected baseline gate. It requires a working Claude sign-in and may use paid model credits; never runs in CI. `node scripts/eval-records.mjs --only=reordered` reruns that pair. Ordinary `npm test` uses deterministic local checks, not model calls.

The first sandboxed auth-status check incorrectly appeared signed out because it could not access the existing login; checking in the normal host environment confirmed the active session. No new login/token was required.

[Processing and response-size benchmark](../bench/RECORDS.md) · [Contract and limits](../packages/context/docs/RECORD_DIFF.md).
