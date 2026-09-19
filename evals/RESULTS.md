# Tool-selection eval results — tiny-context

_2026-09-19 · headless `claude -p` · 12/12 pass_

| Task | Result | Tools called | Turns | Time | Cost |
|---|---|---|---:|---:|---:|
| sales-by-region | ✅ pass | ToolSearch → query_table → query_table | 4 | 11s | $0.189 |
| negative-total | ✅ pass | ToolSearch → query_table | 3 | 11s | $0.128 |
| 5xx-spike | ✅ pass | ToolSearch → summarize_log | 3 | 7s | $0.137 |
| contract-termination | ✅ pass | ToolSearch → file_map → query_file | 4 | 9s | $0.211 |
| deck-pricing | ✅ pass | ToolSearch → file_map → read_section | 4 | 7s | $0.166 |
| handbook-outline | ✅ pass | ToolSearch → file_map | 3 | 8s | $0.142 |
| handbook-remote | ✅ pass | ToolSearch → file_map → read_section | 4 | 8s | $0.191 |
| callers | ✅ pass | Bash → Bash → Bash → Bash → ToolSearch → file_map → query_file → file_map | 9 | 26s | $0.324 |
| validate-json | ✅ pass | ToolSearch → validate_file | 3 | 5s | $0.125 |
| emails | ✅ pass | ToolSearch → extract | 3 | 8s | $0.144 |
| diff | ✅ pass | ToolSearch → diff_files | 3 | 6s | $0.132 |
| negative-small-file | ✅ pass | Read | 2 | 11s | $0.116 |

Prompts are natural user language (see `tasks/context.json`). Pass = the intended tool was called with sane params and the large fixture was never read raw; the negative case passes when the built-in Read is used for a 2 KB file and no tiny-context tool is called.
