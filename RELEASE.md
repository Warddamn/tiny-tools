# Release and discovery

Built by **AVRG3**. Verified 2026-09-21.

## Live distribution

- [Official MCP Registry](https://registry.modelcontextprotocol.io/?q=io.github.Warddamn%2Ftiny-context): active `io.github.Warddamn/tiny-context` version 0.1.0.
- [Glama](https://glama.ai/mcp/servers/Warddamn/tiny-tools): repository already indexed; this session verified its public page, not ownership or refreshed indexing.
- [Agent bundles](https://github.com/Warddamn/tiny-tools/releases/tag/context-v0.1.0): macOS, Linux and Windows MCPB downloads. Each includes its x64/arm64 dependencies. Node.js 20+ or a compatible host runtime is required.
- The original `v0.1.0` standalone tarball remains the install source for npx client configs. It bundles internal shared code and downloads third-party dependencies.
- npm is not published. An npm login is not needed for either current install route or for registry publication.

## Verify a bundle locally

Run `npm test`, then `npm run bundle:mcpb`. The builder uses the checked-in lockfile to install production dependencies in a temporary folder, copies only distributable workspace files, adds the other native architectures from integrity-checked packages, and packs the bundle with `@anthropic-ai/mcpb@2.1.2`.

Run `npm run verify:mcpb -- .tmp/mcpb/tiny-context-0.1.0-darwin.mcpb` for the macOS output (substitute the package version and `linux` or `win32` on those systems). This extracts the actual archive outside the repository and checks all eight MCP tools plus XLSX, without npm on the server's PATH. Node itself is supplied by the test host.

The three-platform publication run was [35621683385](https://github.com/Warddamn/tiny-tools/actions/runs/35621683385); source CI was [35621684626](https://github.com/Warddamn/tiny-tools/actions/runs/35621684626). Both passed. Other CPU/OS combinations and individual client installation screens are not covered by these checks.

## Publish a new version

1. Choose a new context package version; update package.json and the lockfile consistently. The live 0.1.0 release must not be overwritten.
2. Update PROGRESS.md and release documentation, run tests, then push the reviewed changes to main.
3. On GitHub, choose **Actions → Publish to MCP Registry → Run workflow → main → Run workflow**. The workflow builds and tests all three bundles, creates `context-v<version>`, and publishes the generated registry metadata using GitHub OIDC. No new secret or npm token is required.
4. Check that the final registry verification step passes. Download the release's `server.json`, confirm its package hashes match GitHub's asset digests, and update `packages/context/server.json` to the published metadata.

The registry metadata is generated from actual build outputs. The publisher is pinned to v1.8.1 and its checksum is verified. Bundles are unsigned; registry hashes provide download integrity, not third-party certification. Existing release assets are compared, never silently replaced. If a failed publish needs retrying with unchanged artifacts, use **Re-run failed jobs** on that run; changing an already published bundle requires a new version.

## Agent positioning and limits

Lead with SQL spreadsheet questions, recurring error-log diagnosis and targeted PDF/Office retrieval. The example claim is 7 turns → 3 on one log task; see [the complete comparison](evals/COMPARISON.md) for all tasks, including regressions. A listing allows discovery; clients still control which tools are installed and enabled. Downloads include bots and our own verification.

Optional future npm distribution can be added after ownership and publishing access are verified. Do not replace working GitHub install commands with npm names until a clean npm install has been tested. Directory submission or indexing does not guarantee ranking or usage.
