# Tool-selection eval results — tiny-context (mode: snippet)

_2026-09-22 · headless `claude -p` · model sonnet · 9/12 pass · pass = correct answer AND tool rules hold_

| Task | Result | Correct | Tools called (⛔ blocked by hook · ✗ denied · ! error) | Turns | Tokens | Time | Cost |
|---|---|---|---|---:|---:|---:|---:|
| sales-by-region | ❌<br>raw Bash of sales.csv (1×) | ✓ | ToolSearch → Bash → query_table | 4 | 168,774 | 6s | $0.100 |
| negative-total | ✅ | ✓ | ToolSearch → query_table | 3 | 125,635 | 4s | $0.065 |
| 5xx-spike | ✅ | ✓ | ToolSearch → summarize_log | 3 | 125,749 | 5s | $0.067 |
| contract-termination | ✅ | ✓ | ToolSearch → query_file | 3 | 127,130 | 6s | $0.073 |
| deck-pricing | ❌<br>raw Bash of deck.pptx (1×) | ✓ | ToolSearch → Bash → query_file | 4 | 168,197 | 6s | $0.077 |
| handbook-outline | ✅ | ✓ | file_map | 2 | 83,481 | 5s | $0.058 |
| handbook-remote | ✅ | ✓ | ToolSearch → Glob → query_file | 4 | 168,008 | 5s | $0.076 |
| callers | ⚠️ soft<br>expected one of [query_file, file_map], saw Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep | ✓ | Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep | 16 | 173,750 | 18s | $0.105 |
| validate-json | ✅ | ✓ | ToolSearch → validate_file | 3 | 124,854 | 4s | $0.063 |
| emails | ✅ | ✓ | ToolSearch → extract | 3 | 125,587 | 4s | $0.065 |
| diff | ✅ | ✓ | ToolSearch → diff_files | 3 | 125,560 | 4s | $0.066 |
| negative-small-file | ✅ | ✓ | Read | 2 | 82,249 | 5s | $0.051 |
