# Discovery & measurement plan (researched 2026-09-19)

_How agents and their owners find MCP servers, what usage a maintainer can see, and what to do about it — 13 research/verification agents, 80 sources, 54 of 59 claims verified. Ranked by expected payoff per hour._

## Plain-English answer

Short version: no, you cannot see how many agents actually run tiny-context, and that is a direct consequence of your own "no telemetry, files never leave the device" rule - a local tool that never phones home cannot report back, and no MCP client (Claude Code, Cursor, VS Code, Codex) reports install or usage numbers to the maker of a local server; even Anthropic's own directory dashboard says local servers "aren't visible to Anthropic and aren't counted". What you CAN see, for free and without adding any code, are proxies: npm download counts once the package is published (roughly one download per machine per version, because npx caches the package and later runs are invisible), GitHub stars/forks/visitors/clones (Insights > Traffic, last 14 days only), and third-party estimates on directory pages (PulseMCP "Est. Visitors", Glama's npm/star numbers, Smithery "uses"). Your repo already has `npm run stats` that pulls the npm and GitHub numbers into one screen. On the "SEO for agents" part: the good news is that agent discovery is mostly plain text matching, so it is very controllable. Three things matter most, in order: (1) get the package onto npm and into the official MCP Registry, because Glama, PulseMCP and others copy from there automatically; (2) write the words agents and humans search for into the places search engines actually read - npm description/keywords, the registry `description` (which must be under 100 characters - yours is 246 and will be rejected as-is), the README, and the server's own `instructions` string, which is the ONLY thing Claude Code loads at session start besides tool names; (3) copy what the fastest-growing comparable (Context7) did: a one-click install badge, a before/after story with your benchmark numbers at the top of the README, and per-client install one-liners. Registries and awesome-lists are worth an hour or two each but the evidence says the big growth for tools like this came from people repeating a simple "10x fewer tokens" story in videos and posts, not from directory listings. The list below is ranked by expected payoff per hour; anything marked needs_owner requires your login or your name on a submission.

## Measure (what you can see, and how)

- **npm download counts for @tinytools/context (the closest thing to 'how many machines installed it'; ~1 download per machine per version because npx caches the package)** — After publishing: `curl https://api.npmjs.org/downloads/point/last-week/@tinytools/context` (also last-day, last-month, or a date range like /range/2026-09-19:2026-10-19/). Per-version: `curl 'https://api.npmjs.org/downloads/point/last-week/@tinytools%2Fcontext'` style is required only for /versions/. The repo already wraps this: in the tiny-tools folder run `npm run stats`. Chart: https://npm-stat.com/charts.html?package=%40tinytools%2Fcontext . README badge: `![npm downloads](https://img.shields.io/npm/dw/@tinytools/context)` (dw = weekly, dm = monthly; there is no daily badge). Rule of thumb from npm: only >50 downloads/day is signal rather than mirror/bot noise; single zero days are pipeline gaps. _(owner needed: no · 5 min once the package is on npm (npm publish itself needs the owner))_
- **GitHub repo traffic: views, unique visitors, clones, unique cloners, top referring sites, top pages (last 14 days only)** — Web: github.com/Warddamn/tiny-tools > Insights tab (top of repo) > Traffic (left sidebar). Command line (gh is already logged in as Warddamn on this Mac): `gh api repos/Warddamn/tiny-tools/traffic/views --jq '{count,uniques}'`, same for `/traffic/clones`, `/traffic/popular/referrers`, `/traffic/popular/paths`. `npm run stats` already prints these. Live today: 0 views, 0 clones, empty referrers. _(owner needed: no · 2 min)_
- **Keep traffic history beyond GitHub's 14-day window** — Option A (no code, needs owner sign-in): install Repohistory from https://github.com/marketplace/repohistory (free Starter plan tracks 1 repo; it saves daily from first sign-in and charts full history). Option B (agent can add, no account): a scheduled GitHub Actions workflow `.github/workflows/traffic.yml` (cron daily) that calls the four traffic endpoints with `${{ secrets.GITHUB_TOKEN }}` and commits JSON to `stats/traffic/YYYY-MM-DD.json` - pattern documented at https://github.com/shigechika/github-insights ; if the default token is refused for traffic endpoints, the owner creates a fine-grained PAT with Administration:read and stores it as a repo secret. _(owner needed: yes · 15 min (A) / 30 min (B))_
- **Stars, forks, watchers (public, no login)** — `curl -s https://api.github.com/repos/Warddamn/tiny-tools | jq '{stargazers_count,forks_count,subscribers_count}'` or `gh repo view Warddamn/tiny-tools --json stargazerCount,forkCount,watchers`. Star chart for the README: `https://api.star-history.com/svg?repos=Warddamn/tiny-tools&type=Date`. Live today: 0 / 0 / 0 (repo created 2026-09-19). _(owner needed: no · 1 min)_
- **Directory-side estimates (third parties' guesses, not measurements)** — PulseMCP listing page shows 'Est. Visitors' (an algorithmic estimate from public data and social signals) plus a popularity rank; API field `_meta.com.pulsemcp/server.visitorsEstimateLastFourWeeks` - but PulseMCP paused new listings on 2026-09-03 and will pick you up from the official registry 'once we are back'. Glama listing shows weekly npm downloads, stars and A-F grades; claiming it (GitHub OAuth) unlocks 'listing details, thumbnails, health checks, and analytics'. Smithery shows a 'uses' counter (useCount = times connected via Smithery), public at `https://registry.smithery.ai/servers?q=tiny-context` - whether a local MCPB listing accrues uses is undocumented. Docker Hub pull_count at `https://hub.docker.com/v2/repositories/mcp/tiny-context/` only if Docker builds the image from your Dockerfile. _(owner needed: yes · 0 min after the listings exist (see be_found))_
- **The only way to count actual agent sessions: opt-in usage statistics inside the server (Grafana model). NOT recommended under the current spec - listed so the trade-off is explicit** — If the owner ever relaxes the rule, the community-accepted design is grafana/mcp-grafana: OFF by default, enabled only with `--usage-stats=enabled` or an env var, `=log` mode prints exactly what would be sent and sends nothing, honors DO_NOT_TRACK=1, one anonymous report per process every 4 hours (version, OS, tool names, error counts - never paths, queries or content). Default-on telemetry reliably draws public complaints (Chrome DevTools MCP #1811, blender-mcp #232, AWS DynamoDB MCP #2382). Today: do nothing; keep the 'no telemetry' line as a selling point. _(owner needed: yes · Decision only; 2-4 hrs if ever built)_

## Be found (ranked)

### 1. Publish @tinytools/context (and @tinytools/shared) to npm - the gate for every other channel
_Owner needed: yes · effort 30 min_

**Why.** Every registry, badge, download count and `npx` install depends on it. Today `api.npmjs.org` returns 'package @tinytools/context not found'. npm search itself matches title/description/readme/keywords with almost no popularity ranking, and new packages can take up to two weeks to appear in npm search - so publish first, polish in parallel.

**How.** Owner in Terminal, inside the tiny-tools folder: `npm login` (browser window opens), confirm the @tinytools scope is yours or free on npmjs.com, then `npm run test`, `npm publish --workspace packages/shared --access public`, `npm publish --workspace packages/context --access public`. Verify: `npx -y -p @tinytools/context tiny-context --help`. RELEASE.md in the repo already has the sequence.

### 2. Fix packages/context/server.json so it validates, then publish to the official MCP Registry (and add the GitHub Actions auto-publisher)
_Owner needed: yes · effort 45 min_

**Why.** The official registry is what Glama ('superset of that registry'), PulseMCP ('we will pick it up automatically'), and other aggregators copy from about hourly - one submission, many listings. BLOCKER: both the 2025-09-29 schema you reference and the current 2025-12-11 schema cap `description` at 100 characters; yours is 246 and `mcp-publisher publish` will reject it. Registry search is name-substring only ('tiny' and 'context' match; description words do not), so the name is the search hook there.

**How.** Agent edits (see repo_edits_now): switch `$schema` to 2025-12-11, shorten description to <=100 chars, add `title`. Owner then: `brew install mcp-publisher`, `cd packages/context`, `mcp-publisher login github` (browser device-code login), `mcp-publisher publish`, verify with `curl 'https://registry.modelcontextprotocol.io/v0/servers?search=tiny-context'`. The name `io.github.warddamn/tiny-context` must match your GitHub username; the registry preserves case in other namespaces and case-sensitivity of the auth check is undocumented - if publish is refused, change both `name` and package.json `mcpName` to `io.github.Warddamn/tiny-context`. Agent can also add `.github/workflows/publish-mcp.yml` (publishes on `v*` tags) per https://modelcontextprotocol.io/registry/github-actions .

### 3. Add a server-level `instructions` string to the MCP server and keep tool names/descriptions keyword-rich
_Owner needed: no · effort 30 min_

**Why.** This is the in-session 'SEO'. Claude Code has tool search ON by default: at session start it loads ONLY tool names and the server `instructions`; full descriptions are fetched on demand when the model searches by keyword across names, descriptions and parameter descriptions. Anthropic's docs: instructions should say 'what category of tasks your tools handle, when Claude should search for your tools, key capabilities', truncated at 2KB, critical details first. Names like `search_slack_messages` surface more often than `query_slack` - your 8 names are already verb_noun and your descriptions (0.9-1.2 KB each) are under the 2 KB cap, so this is one missing string, not a rewrite.

**How.** Agent edit in packages/context/src/mcp.ts: `new McpServer({ name: 'tiny-context', version }, { instructions: '...' })` with ~600 chars: category (files, documents, tables, logs), trigger words (PDF, DOCX, PPTX, XLSX, CSV, Parquet, log, diff, validate, extract, large file, token), when to search for these tools (before reading any file >20 KB or any office/PDF file; any question about spreadsheet data; any log), and the 8 tool names. Consider `_meta: { 'anthropic/alwaysLoad': true }` on `file_map` only, so one gateway tool is always visible (each upfront tool costs context). Also add the words 'model context protocol', 'Claude Code', 'Cursor', 'Codex', 'Copilot' to the tool-free places (README, package.json), never into tool descriptions.

### 4. README front page rebuilt to match the high-adoption pattern: one-click install badges, before/after headline, per-client one-liners, privacy statement
_Owner needed: no · effort 1 hr_

**Why.** Every comparable with big adoption (Context7 62k stars, Playwright MCP, GitHub MCP, Exa) has install badges above the fold and per-client commands; Context7's README leads with 'Without Context7 / With Context7'. Your README has the strongest possible before/after (7.4M naive tokens -> 9.2K, 99.9% saved) buried at line 44 with no visual, and no badges. This is also what people share on Reddit/YouTube.

**How.** Agent edit. Top of README.md and packages/context/README.md: (a) headline '7,415,930 tokens -> 9,169. Same answers.' with the benchmark table's summary line; (b) badges: Cursor `[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tiny-context&config=<base64 of {"command":"npx","args":["-y","-p","@tinytools/context","tiny-context-mcp"]}>)`, VS Code `vscode:mcp/install?<urlencoded JSON>` wrapped in an `insiders.vscode.dev/redirect?url=` link, npm version + downloads shields; (c) one-liners: `claude mcp add tiny-context -- npx -y -p @tinytools/context tiny-context-mcp`, `codex mcp add tiny-context -- npx -y -p @tinytools/context tiny-context-mcp`, Cursor/Windsurf/Copilot JSON blocks (.cursor/mcp.json, .vscode/mcp.json); (d) a '## Privacy' section: no telemetry, no network calls, files never leave the device (also required verbatim-ish by Anthropic's desktop-extension form later). Badges only work after npm publish, so ship them in the same push as priority 1.

### 5. npm package.json keywords and description tuned for npm search and for aggregators that index npm
_Owner needed: no · effort 15 min_

**Why.** npm docs: search is keyword matching over title, description, readme, keywords, with no popularity weighting - so vocabulary is the whole game. Your 13 keywords omit the protocol's long name and every client name; Exa's list includes 'model context protocol', 'claude', 'ai'; Context7 includes 'modelcontextprotocol', 'developer tools', 'documentation'. Glama sorts by weekly npm downloads and reads npm metadata.

**How.** Agent edit to packages/context/package.json: keep existing 13, add `model-context-protocol`, `modelcontextprotocol`, `ai-agents`, `claude`, `claude-code`, `cursor`, `codex`, `copilot`, `csv`, `parquet`, `sql`, `sqlite`-no (avoid words you do not support), `local-first`, `privacy`, `token-savings`, `context-window`, `document-search`, `spreadsheet`. Rewrite description to lead with the searchable nouns: 'MCP server (Model Context Protocol) for AI coding agents: outline, search, slice and SQL-query PDF, DOCX, PPTX, XLSX, CSV, Parquet and log files without reading whole files. Local-first, no telemetry.'

### 6. Glama: add glama.json, submit the repo, claim it with GitHub login
_Owner needed: yes · effort 20 min_

**Why.** Glama (89k servers) is the largest browsable directory, sorts by npm downloads/stars/recent usage, grades each tool's description (TDQS) and shows npm weekly downloads - free numbers for you. Its bot also enforces a Glama badge on awesome-mcp-servers PRs (priority 7), so this unlocks that channel. Claiming gives 'listing details, thumbnails, health checks, and analytics'.

**How.** Agent adds `/glama.json` at repo root: `{"$schema":"https://glama.ai/mcp/schemas/server.json","maintainers":["Warddamn"]}`. Owner: go to https://glama.ai/mcp/servers > 'Add Server' > paste https://github.com/Warddamn/tiny-tools > 'Login with GitHub' when prompted to claim (Glama checks you have write access). Most submissions pass automated checks within minutes. Then add the score badge `[![Warddamn/tiny-tools MCP server](https://glama.ai/mcp/servers/Warddamn/tiny-tools/badges/score.svg)](https://glama.ai/mcp/servers/Warddamn/tiny-tools)` to the README.

### 7. PR to punkpeye/awesome-mcp-servers (95k stars) under 'File Systems' or 'Search & Data Extraction'
_Owner needed: yes · effort 20 min_

**Why.** Highest-traffic human-curated list; it links to Glama and its maintainers fast-track agent PRs. Needs the Glama listing/badge first (bot comment on PR #14229 demands it).

**How.** After priority 6: fork, add ONE line in alphabetical order, e.g. `- [Warddamn/tiny-tools](https://github.com/Warddamn/tiny-tools) 📇 🏠 🍎 🪟 🐧 - Outline, search, slice, SQL-query, diff and validate PDF/DOCX/PPTX/XLSX/CSV/logs without reading whole files; local-first, no telemetry.` An agent can draft the PR text; opening it under your GitHub account is yours. If an agent opens it, append `🤖🤖🤖` to the PR title (their documented fast-track).

### 8. GitHub topics: add the missing search terms
_Owner needed: yes · effort 5 min_

**Why.** Topic pages are crowded (mcp 78k repos, sorted by stars) but free and browsed; comparables carry 12-15 topics. Missing from yours: the protocol's full name and the file-type words people actually search.

**How.** Owner (or agent with the owner's ok, since it changes the public repo): `gh repo edit Warddamn/tiny-tools --add-topic model-context-protocol,pdf,docx,xlsx,csv,duckdb,logs,agent-tools,cursor,codex,developer-tools,typescript` (max 20 topics total). Also set the repo Website field to the README anchor.

### 9. Claude Code plugin packaging (repo becomes its own marketplace) + community marketplace submission
_Owner needed: yes · effort 1 hr build (agent) + 15 min submit (owner)_

**Why.** Worth it, moderately: a plugin lets any Claude Code user run `/plugin marketplace add Warddamn/tiny-tools` and get the MCP server plus a SKILL.md that teaches when to use it (your 'agent usage snippet' becomes the skill). The Discover pane shows 'Context cost' and 'Will install', no install counts, so it is a distribution channel, not a metric. Official marketplace has no application process; the community marketplace (anthropics/claude-plugins-community, 4.3k stars) accepts individuals via the Console form after automated screening.

**How.** Agent adds `.claude-plugin/marketplace.json`, `plugins/tiny-context/.claude-plugin/plugin.json`, `plugins/tiny-context/.mcp.json` (the same npx config) and `plugins/tiny-context/skills/tiny-context/SKILL.md` (the usage snippet), then tests with `claude --plugin-dir ./plugins/tiny-context` and `claude plugin validate ./plugins/tiny-context`. Owner: submit at https://platform.claude.com/plugins/submit (public repo required). Note Anthropic's two doc pages disagree on whether submissions land in the community or official marketplace; expect community (`tiny-context@claude-community`).

### 10. Smithery listing as a local MCPB bundle
_Owner needed: yes · effort 1 hr_

**Why.** 22k-server directory with a visible 'uses' counter and semantic search over names+descriptions. Caveat: 'uses' counts Smithery-routed connections; whether a locally-run bundle ever increments it is undocumented, so treat it as reach, not measurement.

**How.** Build an .mcpb bundle (manifest.json + the built server; Anthropic's MCPB spec), then owner runs `smithery mcp publish ./tiny-context.mcpb -n warddamn/tiny-context` after `smithery login` (WorkOS/GitHub). The same bundle is reusable for priority 13.

### 11. Free submissions to mcp.so and MCP Market (skip the paid tiers)
_Owner needed: yes · effort 10 min_

**Why.** Both are high-traffic SEO directories (mcp.so markets DR 72 / 2.2M visitors). Free queues: mcp.so review queue, MCP Market 'avg 4-6 weeks'. Paid $39/$29 buys speed and a badge, not agent discovery - not worth it at 0 stars. Neither shows per-server usage.

**How.** Owner: https://mcp.so/submit?type=server (repo URL + name) and https://mcpmarket.com/submit (repo URL + email). 5 minutes each, then forget about them.

### 12. A single before/after post and a 60-90 second screen recording, then seed it where Context7 grew
_Owner needed: yes · effort 3-4 hrs_

**Why.** The verified growth story of the closest analog is people repeating a simple claim ('Free tool makes Cursor 10x smarter') in YouTube videos and Reddit threads, plus 15 translated READMEs - not registries. You have a rarer, more honest number (measured 99.9% token savings on real tasks). This is the highest-ceiling item but needs your voice.

**How.** Owner: write one post (title along the lines of 'I measured it: 7.4M tokens -> 9K for the same 17 tasks, local-only MCP, no telemetry'), record a terminal clip of `file_map` on a 100-page PDF vs Claude reading it, embed the clip at the top of the README (GitHub user-attachments video, as Serena does), post to r/ClaudeAI, r/ClaudeCode, r/mcp, r/cursor; email the creators Context7 lists (Better Stack, Cole Medin, AICodeKing, JeredBlu, Sean Kochel) with the numbers and a one-line install. An agent can draft all text.

### 13. Anthropic Connectors Directory as a desktop extension (MCPB) - lower priority
_Owner needed: yes · effort 45 min after priority 10_

**Why.** Gives Claude Desktop users one-click install and Anthropic screens it, BUT you get zero usage numbers ('local servers ... aren't visible to Anthropic and aren't counted') and it needs a README 'Privacy Policy' section plus `privacy_policies` HTTPS URLs in manifest.json or it is rejected immediately. Your tools already have `title` and readOnlyHint/destructiveHint, which the form requires.

**How.** Reuse the MCPB from priority 10; add the Privacy Policy README section (agent can write it - it is a true statement of 'collects nothing'); owner submits via the Google Form at https://clau.de/desktop-extention-submission (no Team/Enterprise org needed for the desktop-extension path).

### 14. Docker MCP Catalog PR (Docker-built image) - optional, gives a public pull count
_Owner needed: yes · effort 1.5 hrs_

**Why.** Docker reviews and builds the image, signs it, and lists it in Docker Desktop's MCP Toolkit within 24 hours; the mcp/ namespace image then has a public `pull_count` - one more free usage proxy. Requires a Dockerfile and MIT license (you have MIT). Local file tools need volume mounts, which makes the UX clunky, hence low priority.

**How.** Agent adds a Dockerfile to packages/context. Owner: fork docker/mcp-registry, `task wizard` (or `task create -- --category developer-tools https://github.com/Warddamn/tiny-tools`), open the PR; do NOT push your own image or you lose the mcp/ namespace and signing.

### 15. Cursor directory and GitHub MCP Registry nominations - cheap emails/forms, low odds
_Owner needed: yes · effort 15 min_

**Why.** cursor.directory/plugins/new is the community MCP listing Cursor's docs point to (needs GitHub/Google sign-in). github.com/mcp (252 hand-picked servers, sorted by stars, backs VS Code's @mcp gallery) is still 'a manual curation process' as of May 2026; publishing to the official registry does NOT put you there. OpenAI/ChatGPT has no path for a local server (remote HTTPS only) - skip.

**How.** Owner: submit at https://cursor.directory/plugins/new ; email partnerships@github.com with the repo link and benchmark line once you have some stars. Expect silence until there is traction.

### 16. llms.txt and committed AGENTS.md
_Owner needed: no · effort 10 min_

**Why.** Marginal but free: llms.txt is the proposed index that doc crawlers and some agents read; AGENTS.md is the open format 20+ agent tools read - yours exists but is untracked (`?? AGENTS.md` in git status), so GitHub does not have it.

**How.** Agent: `git add AGENTS.md`; add `/llms.txt` (H1, one-paragraph summary, links to the two READMEs, tool list). Commit both.

## Repo edits an agent can make today (no accounts)

- packages/context/server.json: change `$schema` to https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json; replace the 246-char `description` with a <=100-char one, e.g. 'Outline, search, SQL-query, diff and validate PDF/DOCX/PPTX/XLSX/CSV/logs without reading whole files' (99 chars); add `"title": "tiny-context"`. Without this `mcp-publisher publish` fails schema validation (maxLength 100 in both the old and current schema).
- packages/context/src/mcp.ts: pass a second argument to `new McpServer(...)`: `{ instructions: '<~600 chars: category of tasks, trigger words PDF/DOCX/PPTX/XLSX/CSV/Parquet/log/diff/validate/extract, when to search for these tools, the 8 tool names>' }`. Claude Code loads only tool names + this string at session start (2 KB cap, critical details first). Optionally add `_meta: { 'anthropic/alwaysLoad': true }` to the `file_map` registration only.
- packages/context/package.json: expand `keywords` (model-context-protocol, modelcontextprotocol, ai-agents, claude, claude-code, cursor, codex, copilot, csv, parquet, sql, local-first, privacy, token-savings, context-window, document-search, spreadsheet) and rewrite `description` to lead with 'MCP server (Model Context Protocol) for AI coding agents: ...'. npm search is keyword matching over title/description/readme/keywords with no popularity ranking.
- README.md and packages/context/README.md: move the benchmark headline ('17 tasks · 7,415,930 naive tokens -> 9,169 tool tokens · 99.9% saved') to the first screen as a before/after; add badge row (Cursor deeplink badge using base64 of {"command":"npx","args":["-y","-p","@tinytools/context","tiny-context-mcp"]}, VS Code `vscode:mcp/install?` link, shields npm version + `npm/dw` downloads, star-history image); add per-client one-liners (`claude mcp add tiny-context -- npx -y -p @tinytools/context tiny-context-mcp`, `codex mcp add tiny-context -- npx -y -p @tinytools/context tiny-context-mcp`, .cursor/mcp.json, .vscode/mcp.json, Windsurf JSON); add a '## Privacy' section stating no telemetry, no network calls, no data collection (reusable later as the 'Privacy Policy' section Anthropic's desktop-extension form demands).
- Add /glama.json at repo root: {"$schema":"https://glama.ai/mcp/schemas/server.json","maintainers":["Warddamn"]} (required for Glama claim; harmless until then).
- Add .github/workflows/publish-mcp.yml (official registry publish on `v*` tags, per modelcontextprotocol.io/registry/github-actions) - it does nothing until the owner tags a release after npm publish.
- Add .github/workflows/traffic.yml: daily cron that saves the four GitHub traffic endpoints to stats/traffic/<date>.json and commits, so the 14-day window is not lost (verify the default GITHUB_TOKEN is accepted; otherwise flag for the owner to add a PAT secret).
- Add Claude Code plugin scaffolding: .claude-plugin/marketplace.json, plugins/tiny-context/.claude-plugin/plugin.json, plugins/tiny-context/.mcp.json, plugins/tiny-context/skills/tiny-context/SKILL.md (from the existing 'Agent usage snippet'); run `claude plugin validate ./plugins/tiny-context`.
- `git add AGENTS.md` (currently untracked, so GitHub has no AGENTS.md); add /llms.txt (H1, summary blockquote, links to READMEs and tool docs).
- Add packages/context/Dockerfile (node:20-slim, npm ci, entrypoint tiny-context-mcp) so the Docker MCP Catalog PR is possible later; optional.
- Update scripts/stats.mjs docstring only if needed: it already covers npm point downloads and GitHub traffic; consider adding the /traffic/popular/referrers and stars line if missing (verify by running `npm run stats`).

## Honest limits

1. Actual agent usage of a local, no-telemetry stdio server is unmeasurable by design: no MCP client (Claude Code, Cursor, VS Code, Codex, Windsurf) reports installs or calls to the server's author; Anthropic's directory dashboard explicitly excludes local servers; the official MCP Registry stores metadata only (download-count tracking is an unchecked roadmap item). The only way to count sessions is code inside the server that reports out, which your spec forbids and which draws public backlash when default-on. 2. npm downloads are a floor, not a headcount: npx caches the package, so a machine that runs tiny-context every day for a month shows as ~1 download per version; conversely mirrors, CI and analysis bots inflate counts, and npm's own guidance is that <50/day is noise. Cache hits and `npm ci` from a lockfile are invisible. 3. GitHub traffic is 14 days only and hides search engines and GitHub-internal referrals; today every number is zero because the repo is hours old. 4. Directory 'popularity' numbers are estimates: PulseMCP's Est. Visitors is an algorithm over SEO and social signals (and PulseMCP is not accepting listings as of 2026-09-03, no reopen date); Smithery 'uses' counts Smithery-routed connections and may never move for a local bundle; Glama's numbers are just npm downloads and stars re-displayed. 5. No search surface ranks by relevance the way Google does: official registry search is name-substring only (an open issue #1453 asks for description search), npm search is word matching with no popularity weight and may take up to two weeks to index a new package, GitHub topic pages sort by stars (you have 0), github.com/mcp is hand-curated and not fed by the registry. 6. Whether the registry accepts `io.github.warddamn/...` for GitHub user `Warddamn` (case) is undocumented; may need to match case exactly. 7. Whether Anthropic's plugin submission lands in the official or community marketplace is contradicted across Anthropic's own docs. 8. The 'what made Context7 grow' story is inference from its README and third-party lists, not attribution data; it is the best available evidence, not proof. 9. Nothing here creates demand: listings make you findable to someone already looking; the benchmark story is what would make people look.

## Sources

- https://modelcontextprotocol.io/registry/about
- https://modelcontextprotocol.io/registry/quickstart
- https://modelcontextprotocol.io/registry/github-actions
- https://modelcontextprotocol.io/registry/registry-aggregators
- https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md
- https://github.com/modelcontextprotocol/registry/issues/1453
- https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
- https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json
- https://registry.modelcontextprotocol.io/v0/servers?search=tiny-context
- https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search
- https://code.claude.com/docs/en/mcp#exempt-a-server-from-deferral
- https://code.claude.com/docs/en/agent-sdk/tool-search
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#best-practices-for-tool-definitions
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://code.claude.com/docs/en/plugins#submit-your-plugin-to-the-community-marketplace
- https://code.claude.com/docs/en/discover-plugins
- https://code.claude.com/docs/en/plugin-marketplaces
- https://claude.com/docs/connectors/building/submission
- https://claude.com/docs/connectors/building/managing-your-listing
- https://claude.com/docs/connectors/directory
- https://claude.com/blog/connectors-directory
- https://docs.npmjs.com/searching-for-and-choosing-packages-to-download
- https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- https://docs.npmjs.com/cli/v11/commands/npx/
- https://github.com/npm/registry/blob/main/docs/download-counts.md
- https://blog.npmjs.org/post/92574016600/numeric-precision-matters-how-npm-download-counts-work.html
- https://github.com/npm/cli/issues/4108
- https://api.npmjs.org/downloads/point/last-week/@playwright/mcp
- https://shields.io/badges/npm-downloads
- https://npm-stat.com/charts.html?package=%40tinytools%2Fcontext
- https://github.com/star-history/star-history
- https://docs.github.com/en/rest/metrics/traffic
- https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository
- https://docs.github.com/en/rest/repos/repos#get-a-repository
- https://github.com/repohistory/repohistory
- https://github.com/marketplace/repohistory
- https://github.com/shigechika/github-insights
- https://api.github.com/repos/Warddamn/tiny-tools
- https://www.pulsemcp.com/api
- https://www.pulsemcp.com/submit
- https://www.pulsemcp.com/servers/pulse-fetch
- https://www.pulsemcp.com/servers/microsoft-playwright
- https://glama.ai/mcp/methodology
- https://glama.ai/mcp/servers
- https://glama.ai/mcp/faq
- https://glama.ai/mcp/schemas/server.json
- https://smithery.ai/docs/build/publish
- https://smithery.ai/docs/build
- https://smithery.ai/docs/concepts/registry_search_servers
- https://mcp.so/submit?type=server
- https://mcpmarket.com/submit
- https://github.com/cline/mcp-marketplace
- https://cursor.com/docs/context/mcp/install-links
- https://cursor.com/docs/mcp
- https://cursor.com/docs/plugins
- https://cursor.directory/plugins/new
- https://code.visualstudio.com/api/extension-guides/ai/mcp
- https://github.com/github/github-mcp-server/discussions/1257
- https://github.blog/ai-and-ml/github-copilot/meet-the-github-mcp-registry-the-fastest-way-to-discover-mcp-servers/
- https://docs.devin.ai/desktop/cascade/mcp
- https://developers.openai.com/plugins/deploy/submission
- https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md
- https://github.com/punkpeye/awesome-mcp-servers/pull/14229
- https://docs.docker.com/ai/mcp-catalog-and-toolkit/catalog/
- https://github.com/docker/mcp-registry/blob/main/CONTRIBUTING.md
- https://raw.githubusercontent.com/upstash/context7/master/README.md
- https://raw.githubusercontent.com/microsoft/playwright-mcp/main/README.md
- https://github.com/oraios/serena
- https://www.thoughtworks.com/radar/tools/context7
- https://agents.md/
- https://llmstxt.org/
- https://grafana.com/docs/grafana/latest/developer-resources/mcp/anonymous-usage-statistics/
- https://donottrack.sh/
- https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1811
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- https://clau.de/desktop-extention-submission
- file:///Users/payton/Desktop/pw%20papps/tiny-tools/packages/context/server.json
- file:///Users/payton/Desktop/pw%20papps/tiny-tools/packages/context/src/mcp.ts
- file:///Users/payton/Desktop/pw%20papps/tiny-tools/scripts/stats.mjs
