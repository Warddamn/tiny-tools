# Tool-selection eval results — tiny-context (mode: snippet)

_2026-09-19 · headless `claude -p` · 11/12 pass · pass = correct answer AND tool rules hold_

| Task | Result | Correct | Tools called (⛔ blocked by hook · ✗ denied · ! error) | Turns | Tokens | Time | Cost |
|---|---|---|---|---:|---:|---:|---:|
| sales-by-region | ✅ | ✓ | ToolSearch → query_table | 3 | 88,907 | 6s | $0.173 |
| negative-total | ✅ | ✓ | ToolSearch → query_table | 3 | 88,750 | 6s | $0.137 |
| 5xx-spike | ✅ | ✓ | ToolSearch → summarize_log | 3 | 89,215 | 10s | $0.145 |
| contract-termination | ✅ | ✓ | ToolSearch → Bash → file_map → query_file | 5 | 133,388 | 13s | $0.239 |
| deck-pricing | ✅ | ✓ | ToolSearch → file_map → query_file | 4 | 121,589 | 8s | $0.169 |
| handbook-outline | ✅ | ✓ | ToolSearch → file_map | 3 | 89,680 | 8s | $0.154 |
| handbook-remote | ✅ | ✓ | ToolSearch → Bash → file_map → query_file | 5 | 125,917 | 10s | $0.195 |
| callers | ⚠️ soft<br>expected one of [query_file, file_map], saw Grep, Grep, Grep | ✓ | Grep → Grep → Grep | 4 | 122,930 | 12s | $0.195 |
| validate-json | ✅ | ✓ | ToolSearch → validate_file | 3 | 88,448 | 6s | $0.137 |
| emails | ✅ | ✓ | ToolSearch → extract | 3 | 89,120 | 5s | $0.140 |
| diff | ✅ | ✓ | ToolSearch → Bash → diff_files | 4 | 90,725 | 8s | $0.157 |
| negative-small-file | ✅ | ✓ | Read | 2 | 57,901 | 3s | $0.109 |
