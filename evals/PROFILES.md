# Saved-profile agent checks

Synthetic reports only. Sonnet through the existing authenticated Claude CLI, identical files, saved profile and built-ins for each condition. Tools condition includes routing guidance. Each task is capped at eight turns, 120 seconds and $0.60 reported inference estimate. No company documents; not run by CI.

| Trial | Condition | Correct | Calls | Time | Reported cost |
|---|---|---|---:|---:|---:|
| Initial 25 reports | Profile tools | yes | 5 | 27.946 s | $0.1478962 |
| Initial 25 reports | Built-ins + generated script | yes | 5 | 38.718 s | $0.1538974 |
| After review-first preview | Profile tools | yes | 4 | 16.450 s | $0.1304070 |
| After review-first preview | Built-ins + generated script | yes | 5 | 33.832 s | $0.2007348 |
| Small note (initial) | Tools available, Read chosen | yes | 1 | 3.404 s | $0.0494892 |

Task: check 25 labeled reports against a pre-existing JSON recipe. Exactly 24 match and one lacks a required total. Return both counts and the failing filename. Both routes returned these exact answers. The agent read the saved profile; the tool implementation itself does not need an extra read or outline call.

The initial tool preview showed the first 20 matching documents and omitted the bad 25th file, prompting a second extraction. The implementation now puts review rows first. A regression test locks in that behavior. The paired task was rerun unchanged: one extract call then sufficed. The full output report keeps resolved input order.

The final pair was roughly 35% cheaper and 51% faster for this one task. This is **not a general savings claim**: there is only one trial per condition/revision, no randomized order or confidence interval, and cache state differed. The second built-in run read a full sample before scripting, whereas its first run used a limited sample. The costs are Claude-reported inference estimates, not invoice charges or additional subscription payments. All initial results remain available; this is not the best-of-many outcome.

Profile creation/validation by an agent is excluded: the profile already exists in both conditions. A user must pay that setup/review cost once and amortize it over repeated batches. Model/system/tool-schema overhead and cache usage are included in reported usage for these calls. Setup and local processing are measured separately in [bench/PROFILES.md](../bench/PROFILES.md), where a correct prepared script is much faster than the generic tool. Ordinary extraction can already batch patterns; use profiles only when their reusable validation rules help.

Raw summaries: [initial](PROFILES-initial.json), [after preview fix](PROFILES-targeted.json). Reproduce with `npm run evals:profiles` (requires existing Claude login and uses inference quota). Raw event transcripts are retained locally at the paths in those summaries.

The earlier keyed-export trials in [RECORDS.md](RECORDS.md) had higher tool costs. These new results do not erase them or establish that every Tiny Tools feature lowers a bill.
