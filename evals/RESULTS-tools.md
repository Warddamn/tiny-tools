# Tool-selection eval results — tiny-context (mode: tools)

_2026-09-22 · headless `claude -p` · model sonnet · 11/12 pass · pass = correct answer AND tool rules hold_

| Task | Result | Correct | Tools called (⛔ blocked by hook · ✗ denied · ! error) | Turns | Tokens | Time | Cost |
|---|---|---|---|---:|---:|---:|---:|
| sales-by-region | ✅ | ✓ | ToolSearch → Bash → query_table | 4 | 167,223 | 11s | $0.199 |
| negative-total | ✅ | ✓ | ToolSearch → query_table | 3 | 124,719 | 5s | $0.065 |
| 5xx-spike | ✅ | ✓ | ToolSearch → summarize_log | 3 | 124,649 | 6s | $0.066 |
| contract-termination | ✅ | ✓ | ToolSearch → query_file | 3 | 128,123 | 6s | $0.075 |
| deck-pricing | ✅ | ✓ | ToolSearch → query_file | 3 | 124,495 | 4s | $0.064 |
| handbook-outline | ✅ | ✓ | file_map | 2 | 82,677 | 7s | $0.056 |
| handbook-remote | ✅ | ✓ | ToolSearch → Bash → query_file | 4 | 166,733 | 7s | $0.075 |
| callers | ⚠️ soft<br>expected one of [query_file, file_map], saw Grep, Grep, Grep, Grep, Grep, Grep, Grep, Grep | ✓ | Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep | 9 | 128,024 | 12s | $0.085 |
| validate-json | ✅ | ✓ | ToolSearch → validate_file | 3 | 123,854 | 4s | $0.062 |
| emails | ✅ | ✓ | ToolSearch → Bash → extract | 4 | 169,380 | 7s | $0.080 |
| diff | ✅ | ✓ | ToolSearch → diff_files | 3 | 124,419 | 9s | $0.064 |
| negative-small-file | ✅ | ✓ | Read | 2 | 81,594 | 5s | $0.050 |
