# Tool-selection eval results — tiny-context (mode: hook)

_2026-09-22 · headless `claude -p` · model sonnet · 10/12 pass · pass = correct answer AND tool rules hold_

| Task | Result | Correct | Tools called (⛔ blocked by hook · ✗ denied · ! error) | Turns | Tokens | Time | Cost |
|---|---|---|---|---:|---:|---:|---:|
| sales-by-region | ❌<br>raw Bash of sales.csv (1×) | ✓ | ToolSearch → Bash → query_table | 4 | 167,259 | 10s | $0.098 |
| negative-total | ✅ | ✓ | ToolSearch → query_table | 3 | 124,539 | 4s | $0.064 |
| 5xx-spike | ✅ | ✓ | ToolSearch → summarize_log | 3 | 124,687 | 6s | $0.066 |
| contract-termination | ✅ | ✓ | ToolSearch → query_file | 3 | 128,144 | 6s | $0.076 |
| deck-pricing | ✅ | ✓ | ToolSearch → query_file | 3 | 125,998 | 5s | $0.068 |
| handbook-outline | ✅ | ✓ | file_map | 2 | 82,677 | 5s | $0.056 |
| handbook-remote | ✅ | ✓ | ToolSearch → query_file | 3 | 127,020 | 5s | $0.091 |
| callers | ⚠️ soft<br>expected one of [query_file, file_map], saw Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep | ✓ | Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep | 16 | 174,787 | 24s | $0.116 |
| validate-json | ✅ | ✓ | ToolSearch → validate_file | 3 | 124,303 | 7s | $0.063 |
| emails | ✅ | ✓ | Glob → ToolSearch → extract | 4 | 125,943 | 7s | $0.069 |
| diff | ✅ | ✓ | ToolSearch → diff_files | 3 | 124,845 | 8s | $0.065 |
| negative-small-file | ✅ | ✓ | Read | 2 | 81,787 | 2s | $0.050 |
