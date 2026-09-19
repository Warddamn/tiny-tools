# Honest comparison — the same 12 tasks in 4 conditions

_2026-09-19 · headless `claude -p` · every condition allows the same built-ins (Bash, Read, Grep, Glob) · max 12 turns._

- **none** — no tiny-context, no snippet (what an agent has today)
- **tools** — server attached, no snippet in CLAUDE.md (descriptions alone)
- **snippet** — server attached + the 6-line AGENT_USAGE snippet in CLAUDE.md (recommended install)
- **hook** — server attached + the Read guard hook (Read of PDF/Office/>20 KB files is intercepted and answered with an outline), no snippet

Cell = pass? / turns / total tokens processed (input + cache + output, all turns) / cost in USD. ✅ pass · ⚠️ correct answer but tool rules broken · ❌ wrong or no answer.

| Task | none: ok / turns / tokens / $ | tools: ok / turns / tokens / $ | snippet: ok / turns / tokens / $ | hook: ok / turns / tokens / $ |
|---|---|---|---|---|
| sales-by-region | ✅ / 4 / 115,944 / 0.19 | ✅ / 4 / 88,668 / 0.18 | ✅ / 3 / 88,907 / 0.17 | ✅ / 3 / 88,172 / 0.18 |
| negative-total | ✅ / 3 / 86,623 / 0.13 | ✅ / 3 / 87,490 / 0.13 | ✅ / 3 / 88,750 / 0.14 | ✅ / 4 / 89,156 / 0.15 |
| 5xx-spike | ✅ / 7 / 215,371 / 0.32 | ✅ / 3 / 88,156 / 0.14 | ✅ / 3 / 89,215 / 0.14 | ✅ / 4 / 89,761 / 0.16 |
| contract-termination | ✅ / 5 / 150,009 / 0.21 | ✅ / 4 / 130,076 / 0.22 | ✅ / 5 / 133,388 / 0.24 | ✅ / 5 / 132,190 / 0.23 |
| deck-pricing | ✅ / 6 / 174,166 / 0.33 | ✅ / 5 / 121,195 / 0.17 | ✅ / 4 / 121,589 / 0.17 | ✅ / 4 / 120,419 / 0.17 |
| handbook-outline | ✅ / 3 / 88,745 / 0.16 | ✅ / 3 / 88,707 / 0.15 | ✅ / 3 / 89,680 / 0.15 | ✅ / 3 / 88,865 / 0.15 |
| handbook-remote | ✅ / 3 / 87,928 / 0.15 | ✅ / 6 / 160,290 / 0.24 | ✅ / 5 / 125,917 / 0.19 | ✅ / 5 / 124,269 / 0.19 |
| callers | ✅ / 4 / 122,303 / 0.21 | ⚠️ / 3 / 102,815 / 0.23 | ⚠️ / 4 / 122,930 / 0.19 | ⚠️ / 6 / 189,885 / 0.27 |
| validate-json | ✅ / 5 / 118,283 / 0.20 | ✅ / 4 / 88,454 / 0.14 | ✅ / 3 / 88,448 / 0.14 | ✅ / 4 / 89,444 / 0.15 |
| emails | ✅ / 4 / 117,295 / 0.16 | ✅ / 4 / 89,571 / 0.15 | ✅ / 3 / 89,120 / 0.14 | ✅ / 3 / 89,460 / 0.14 |
| diff | ✅ / 5 / 154,932 / 0.23 | ✅ / 4 / 90,295 / 0.16 | ✅ / 4 / 90,725 / 0.16 | ✅ / 4 / 89,616 / 0.15 |
| negative-small-file | ✅ / 2 / 57,018 / 0.11 | ✅ / 2 / 57,236 / 0.11 | ✅ / 2 / 57,901 / 0.11 | ✅ / 2 / 57,287 / 0.11 |

| Condition | Pass / correct | Avg turns | Total tokens | Total cost | Total time |
|---|---|---:|---:|---:|---:|
| **none** | 12/12 pass · 12/12 correct | 4.3 | 1,488,617 | $2.41 | 193s |
| **tools** | 11/12 pass · 12/12 correct | 3.8 | 1,192,953 | $2.02 | 104s |
| **snippet** | 11/12 pass · 12/12 correct | 3.5 | 1,186,570 | $1.95 | 97s |
| **hook** | 11/12 pass · 12/12 correct | 3.9 | 1,248,524 | $2.04 | 144s |
