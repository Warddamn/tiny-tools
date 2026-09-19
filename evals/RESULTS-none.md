# Tool-selection eval results — tiny-context (mode: none)

_2026-09-19 · headless `claude -p` · 12/12 pass · pass = correct answer AND tool rules hold_

| Task | Result | Correct | Tools called (⛔ blocked by hook · ✗ denied · ! error) | Turns | Tokens | Time | Cost |
|---|---|---|---|---:|---:|---:|---:|
| sales-by-region | ✅ | ✓ | Bash → Bash → Bash | 4 | 115,944 | 10s | $0.188 |
| negative-total | ✅ | ✓ | Bash → Bash | 3 | 86,623 | 7s | $0.133 |
| 5xx-spike | ✅ | ✓ | Bash → Bash → Bash → Bash → Bash → Bash | 7 | 215,371 | 34s | $0.319 |
| contract-termination | ✅ | ✓ | Bash → Bash → Bash → Bash | 5 | 150,009 | 27s | $0.211 |
| deck-pricing | ✅ | ✓ | Bash → Skill → Bash → Bash | 6 | 174,166 | 21s | $0.331 |
| handbook-outline | ✅ | ✓ | Bash → Bash | 3 | 88,745 | 14s | $0.163 |
| handbook-remote | ✅ | ✓ | Bash → Bash | 3 | 87,928 | 11s | $0.146 |
| callers | ✅ | ✓ | Grep → Grep → Grep | 4 | 122,303 | 16s | $0.209 |
| validate-json | ✅ | ✓ | Bash → Read → Read → Bash | 5 | 118,283 | 13s | $0.202 |
| emails | ✅ | ✓ | Bash → Bash → Bash | 4 | 117,295 | 13s | $0.164 |
| diff | ✅ | ✓ | Bash → Bash → Bash → Bash | 5 | 154,932 | 24s | $0.234 |
| negative-small-file | ✅ | ✓ | Read | 2 | 57,018 | 4s | $0.106 |
