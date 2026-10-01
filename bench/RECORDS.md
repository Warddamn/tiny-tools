# Keyed JSON comparison benchmark

Synthetic fixtures; 5 warm-process trials per case; medians; darwin/arm64, Node v24.16.0. Includes file reads, parsing, validation, comparison and response formatting. Excludes MCP startup/model turns. Record order and checkedAt differ; only status/quantity are in scope. All counts asserted against fixture truth. No company data.

| Records per snapshot | Scenario | Both inputs (bytes) | Tool response (bytes) | Prepared script response (bytes) | Tool median ms | Prepared script median ms |
|---:|---|---:|---:|---:|---:|---:|
| 1 | unchanged-reordered | 262 | 773 | 94 | 0.34 | 0.16 |
| 1 | three-changes | 264 | 952 | 143 | 0.25 | 0.13 |
| 10000 | unchanged-reordered | 2657782 | 734 | 106 | 72.45 | 6.65 |
| 10000 | three-changes | 2657788 | 1289 | 263 | 69.04 | 6.54 |

The prepared script already knows the schema and fixture invariants. It is a real efficient alternative, and its output is smaller and its processing can be faster. This feature supplies validation, duplicate/precision checks, scope reporting, bounded previews and optional full reports without asking an agent to write that script. It is not a new faster-than-map-lookup algorithm.

Comparing tool output with both entire files measures context payload avoided, not total model tokens, billed dollars, CPU savings, or independent usage. For tiny files or an existing correct script, use the built-in path. For large, frequently changing snapshots, prefer source-side change feeds where available. JSONL/NDJSON uses the same comparison, with per-line parsing; no JSONL timing claim from this benchmark.

Reproduce: `npm run bench:records`. Results vary by hardware. The benchmark checks answers, not a minimum marketing percentage.
