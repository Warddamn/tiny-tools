# Release checklist (Phase 5)

Who does what: **P** = Payton (accounts, logins, one-click approvals) · **A** = the agent (everything else).

## 0. Decide names (P) — once
- GitHub owner: existing `Warddamn`, or a new `AVRG3` account.
- npm scope: free organisation `tiny_tools_pw` (→ `@tiny_tools_pw/context`) or a personal scope (→ `@<npm-username>/context`).
- Then (A): `node scripts/set-owner.mjs --github <owner> --scope <scope>` · `npm install` · `npm test` · commit.

## 1. Accounts & logins (P)
- npm: account at npmjs.com (verify email; enable 2FA — npm requires it for publishing). Then `npm login` (browser flow, finish within ~2 min) or `npm login --auth-type=legacy`.
- GitHub: `gh auth status` must show the chosen owner. Optional privacy: set the commit email to GitHub's noreply address before pushing (A can rewrite history locally).
- If publishing under an npm org: create it at npmjs.com/org/create (free for public packages) *before* the first publish.

## 2. Pre-flight (A)
- [ ] `npm test` green; `node scripts/sign.mjs --check` green.
- [ ] `npm run bench` fresh; READMEs embed the numbers; `evals/COMPARISON.md` current.
- [ ] `npm pack --dry-run -w packages/shared -w packages/context` shows only `dist/`, `docs/`, `hooks/`, README, LICENSE, package.json.
- [ ] Local install proof: pack both tarballs, install them into a scratch project, drive `tiny-context-mcp` with the SDK client and run `tiny-context --help` (`scripts/verify-install.mjs`).
- [ ] `packages/context/server.json` name/owner/version match package.json; validate with `mcp-publisher validate` (P approves the one-time download of the publisher binary).
- [ ] CHANGELOG entry; version bump (`npm version <semver> -w packages/context -w packages/shared`).

## 3. Publish (A runs, P watches; each step is reversible except the publish itself)
1. `git remote add origin git@github.com:<owner>/tiny-tools.git` (or https) · `git push -u origin main` — first outward-facing step; P confirms.
2. Enable GitHub Actions (CI runs on push; `bench` job keeps the numbers honest).
3. `npm publish --access public -w packages/shared` then `-w packages/context` (shared first — context depends on it). npm will prompt for the 2FA code (P types it).
4. Smoke test as a stranger: `npx -y -p @<scope>/context tiny-context-mcp` from a temp dir, and the JSON config snippet in a fresh Claude Code project.
5. MCP Registry: `mcp-publisher login github` (P completes the browser login) · `mcp-publisher publish` in `packages/context`. Aggregators (Smithery, PulseMCP, Glama, mcp.so) pick it up from there.
6. GitHub: add topics `mcp`, `mcp-server`, `agents`, `claude-code`; create a release `context-v0.1.0` from the tag.

## 4. After
- README badge for CI; pin the install snippet at the top of the repo README.
- Watch npm download counts and registry listing for a day; fix anything a first-time user hits.
- Later packages (images, pdf, …) reuse this list; each gets its own `server.json` and version.
