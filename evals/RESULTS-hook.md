# Tool-selection eval results — tiny-context (mode: hook)

_2026-09-19 · headless `claude -p` · 11/12 pass · pass = correct answer AND tool rules hold_

| Task | Result | Correct | Tools called (⛔ blocked by hook · ✗ denied · ! error) | Turns | Tokens | Time | Cost |
|---|---|---|---|---:|---:|---:|---:|
| sales-by-region | ✅ | ✓ | ToolSearch → query_table | 3 | 88,172 | 9s | $0.176 |
| negative-total | ✅ | ✓ | ToolSearch → Bash → query_table | 4 | 89,156 | 30s | $0.146 |
| 5xx-spike | ✅ | ✓ | ToolSearch → Bash → summarize_log | 4 | 89,761 | 10s | $0.155 |
| contract-termination | ✅ | ✓ | ToolSearch → Bash → file_map → query_file | 5 | 132,190 | 12s | $0.233 |
| deck-pricing | ✅ | ✓ | ToolSearch → file_map → query_file | 4 | 120,419 | 9s | $0.168 |
| handbook-outline | ✅ | ✓ | ToolSearch → file_map | 3 | 88,865 | 10s | $0.154 |
| handbook-remote | ✅ | ✓ | ToolSearch → Bash → file_map → query_file | 5 | 124,269 | 15s | $0.189 |
| callers | ⚠️ soft<br>expected one of [query_file, file_map], saw Grep, Grep, Bash, Grep, Read | ✓ | Grep → Grep → Bash → Grep → Read | 6 | 189,885 | 23s | $0.266 |
| validate-json | ✅ | ✓ | ToolSearch → Bash → validate_file | 4 | 89,444 | 9s | $0.150 |
| emails | ✅ | ✓ | ToolSearch → extract | 3 | 89,460 | 6s | $0.145 |
| diff | ✅ | ✓ | ToolSearch → Bash → diff_files | 4 | 89,616 | 8s | $0.153 |
| negative-small-file | ✅ | ✓ | Read | 2 | 57,287 | 4s | $0.108 |
