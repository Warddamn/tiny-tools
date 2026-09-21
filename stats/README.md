# Usage counters

The daily `traffic` GitHub Actions workflow saves `traffic/<UTC date>.json`. It always records public release asset download counters with the existing Actions token. No extra account is needed for this history, and no telemetry runs inside the tools.

`releases` contains release tags and stable asset IDs with cumulative `downloads` counts. Compare the same asset ID between two dates to see the increase; do not sum cumulative totals. Automated checks, bots and repeat downloads are included. These numbers cannot identify people or agents, or show whether a task succeeded.

`traffic_status` is `not_configured` unless the repository has a `TRAFFIC_TOKEN` secret with Administration: read. Without that optional permission, `views`, `clones`, `referrers` and `paths` are null, not zero. When configured, those fields hold GitHub's rolling 14-day traffic responses and `traffic_status` is `available`. A failed API call fails the job rather than saving misleading empty data.

Traffic windows overlap. To retain daily history, use each dated entry in the views/clones arrays; do not add snapshot totals together. Missing days before archiving began cannot be recovered indefinitely.

The workflow runs daily at 05:23 UTC. To check it on GitHub, click **Actions → traffic**, open a run and read its summary. To run it immediately, choose **Run workflow → main → Run workflow**. `npm run stats` shows the current counters locally; private traffic requires suitable GitHub CLI access.
