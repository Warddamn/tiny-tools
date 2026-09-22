# Tool-selection eval results — tiny-context (mode: none)

_2026-09-22 · headless `claude -p` · model sonnet · 11/12 pass · pass = correct answer AND tool rules hold_

| Task | Result | Correct | Tools called (⛔ blocked by hook · ✗ denied · ! error) | Turns | Tokens | Time | Cost |
|---|---|---|---|---:|---:|---:|---:|
| sales-by-region | ✅ | ✓ | ToolSearch → ToolSearch → Bash → Bash | 5 | 205,289 | 10s | $0.208 |
| negative-total | ✅ | ✓ | ToolSearch → ToolSearch → ToolSearch → Bash → Bash → Bash → Bash | 8 | 335,551 | 17s | $0.120 |
| 5xx-spike | ❌<br>answer missing one of: timeout · pool | ✗ | ToolSearch → ToolSearch → ToolSearch → Bash → ToolSearch → ToolSearch → ToolSearch → Bash → Bash → Bash → Bash → Bash → Bash | 13 | 579,729 | 34s | $0.224 |
| contract-termination | ✅ | ✓ | ToolSearch → ToolSearch → Glob → ToolSearch → ToolSearch → Read! → Bash → Bash → Bash → Bash | 11 | 385,610 | 24s | $0.147 |
| deck-pricing | ✅ | ✓ | ToolSearch → ToolSearch → ToolSearch → Bash → Skill → Bash! → Bash → Bash | 10 | 368,398 | 19s | $0.161 |
| handbook-outline | ✅ | ✓ | ToolSearch → ToolSearch → Glob → Skill → Bash → Bash → Bash | 9 | 341,888 | 18s | $0.132 |
| handbook-remote | ✅ | ✓ | ToolSearch → ToolSearch → Glob → ToolSearch → Bash → ToolSearch → Skill → Bash → Bash | 11 | 437,305 | 21s | $0.207 |
| callers | ✅ | ✓ | Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep → Grep | 16 | 171,635 | 24s | $0.128 |
| validate-json | ✅ | ✓ | ToolSearch → ToolSearch → ToolSearch → ToolSearch → Bash → Read → Read | 8 | 369,821 | 19s | $0.199 |
| emails | ✅ | ✓ | ToolSearch → ToolSearch → ToolSearch → ToolSearch → Bash → ToolSearch → Bash → Bash → Bash → Bash | 11 | 709,158 | 27s | $0.354 |
| diff | ✅ | ✓ | ToolSearch → ToolSearch → ToolSearch → ToolSearch → ToolSearch → Bash → Skill → Bash! → Bash! → Bash | 12 | 561,410 | 30s | $0.278 |
| negative-small-file | ✅ | ✓ | Read | 2 | 79,094 | 2s | $0.069 |
