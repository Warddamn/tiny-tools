# Reusable document profile measurements

Synthetic TXT reports, 3 trials per case; medians, darwin/arm64, Node v24.16.0. No company data or model calls. Setup is one example read plus saving known rules; it does not measure an agent inventing/checking the rules. Batch time includes reading the saved profile, starting an isolated process, reading/parsing every document, validating every field, writing a full report and formatting the bounded response. No warmed document cache carries across batches.

| Documents | Source bytes | Initial example + profile bytes | Response bytes | Complete report bytes | Setup ms | Batch ms | Prepared script ms |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 64 | 324 | 783 | 537 | 0.35 | 57.32 | 0.20 |
| 25 | 948850 | 38214 | 5605 | 6724 | 0.20 | 71.22 | 2.76 |
| 100 | 3795475 | 38214 | 5628 | 26550 | 0.21 | 121.04 | 8.02 |

Every expected field value/status is checked. Batches of 25/100 contain one missing-total document, which must need review. The tiny case demonstrates that a tool response can exceed its entire input. The prepared script already knows the format and is faster; profiles are not a faster parsing algorithm. For complete comparison, use the complete-report bytes, not the preview alone.

The reusable benefit is one batch invocation for all three fields, without resending rules or repeatedly rediscovering them. Existing extraction can also batch patterns; neither that nor a correct script should be displaced merely because a profile is available. A new MCP parameter and its documentation can add model overhead; compare the actual catalog as well.

These figures do not prove lower billed dollars, total model tokens or end-to-end agent time. One-time setup and review must be amortized across actual repeated work. No automatic model fallback runs on mismatches. Reproduce: `npm run bench:profiles`. CI checks answers, not a minimum saving percentage.
