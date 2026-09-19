# Tool-selection eval results — tiny-context (mode: tools)

_2026-09-19 · headless `claude -p` · 11/12 pass · pass = correct answer AND tool rules hold_

| Task | Result | Correct | Tools called (⛔ blocked by hook · ✗ denied · ! error) | Turns | Tokens | Time | Cost |
|---|---|---|---|---:|---:|---:|---:|
| sales-by-region | ✅ | ✓ | ToolSearch → Glob → query_table | 4 | 88,668 | 8s | $0.178 |
| negative-total | ✅ | ✓ | ToolSearch → query_table | 3 | 87,490 | 6s | $0.132 |
| 5xx-spike | ✅ | ✓ | ToolSearch → summarize_log | 3 | 88,156 | 8s | $0.143 |
| contract-termination | ✅ | ✓ | ToolSearch → file_map → query_file | 4 | 130,076 | 9s | $0.220 |
| deck-pricing | ✅ | ✓ | ToolSearch → Glob → file_map → query_file | 5 | 121,195 | 9s | $0.173 |
| handbook-outline | ✅ | ✓ | ToolSearch → file_map | 3 | 88,707 | 9s | $0.152 |
| handbook-remote | ✅ | ✓ | ToolSearch → Bash → file_map → ToolSearch → read_section | 6 | 160,290 | 12s | $0.235 |
| callers | ⚠️ soft<br>expected one of [query_file, file_map], saw Grep, Grep | ✓ | Grep → Grep | 3 | 102,815 | 14s | $0.233 |
| validate-json | ✅ | ✓ | ToolSearch → Glob → validate_file | 4 | 88,454 | 8s | $0.144 |
| emails | ✅ | ✓ | ToolSearch → Bash → extract | 4 | 89,571 | 8s | $0.149 |
| diff | ✅ | ✓ | ToolSearch → Bash → diff_files | 4 | 90,295 | 9s | $0.158 |
| negative-small-file | ✅ | ✓ | Read | 2 | 57,236 | 4s | $0.107 |
