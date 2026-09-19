# stats/

Usage numbers for tiny-tools, kept in git so they outlive GitHub's 14-day window. No telemetry runs inside the tools; everything here comes from public or owner-only APIs.

## traffic/

One JSON file per day, `traffic/<YYYY-MM-DD>.json`, written by the `traffic` GitHub Actions workflow (`.github/workflows/traffic.yml`, daily at 05:23 UTC, or run it by hand from the Actions tab). Each file holds the raw responses of four GitHub API calls for `Warddamn/tiny-tools`:

| key         | endpoint                     | what it is                                              |
| ----------- | ---------------------------- | ------------------------------------------------------- |
| `views`     | `traffic/views`              | page views + unique visitors, last 14 days, per day     |
| `clones`    | `traffic/clones`             | git clones + unique cloners, last 14 days, per day      |
| `referrers` | `traffic/popular/referrers`  | top 10 sites people came from, last 14 days             |
| `paths`     | `traffic/popular/paths`      | top 10 pages inside the repo, last 14 days              |

Because every snapshot covers a rolling 14-day window, consecutive files overlap; to build a full history take each day's own entry from the `views`/`clones` arrays.

The workflow needs a repository secret named `TRAFFIC_TOKEN`: a fine-grained personal access token with **Administration: Read-only** on this repo (the default Actions token cannot read traffic). Without it the workflow still passes but writes nothing and prints a one-line hint.

For a quick look without waiting for the cron: `npm run stats` (npm downloads + the same GitHub numbers, needs `gh auth login`).
