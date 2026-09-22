# Try tiny-runtime: pagination, repeated failures and tool progress

Built by **AVRG3**. These examples use synthetic data only. Requires Node.js 20+ and a connected MCP client.

## Install

For Claude Code, run:

```bash
claude mcp add tiny-runtime -- npx -y -p https://github.com/Warddamn/tiny-tools/releases/download/runtime-v0.1.1/tiny-runtime-0.1.1.tgz tiny-runtime-mcp
```

Alternatively, download [tiny-runtime-0.1.1.mcpb](https://github.com/Warddamn/tiny-tools/releases/download/runtime-v0.1.1/tiny-runtime-0.1.1.mcpb) and open it in an MCPB-compatible client. The bundle includes dependencies for macOS, Windows and Linux; Node.js 20+ is still required. Restart/reconnect the client and confirm three tools: collect_pages, check_progress, plan_cache.

Claude Code plugin users can use `/plugin marketplace add Warddamn/tiny-tools` followed by `/plugin install tiny-runtime@tiny-tools`. This also supplies task-selection instructions. Choose either the plugin or manual MCP setup to avoid duplicate servers.

## 1. Collect every page and total the records

Save [collect.json](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/packages/runtime/examples/collect.json) and [pages.json](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/packages/runtime/examples/pages.json) in the same folder. Or use the `examples` directory included in the package/bundle.

Ask your agent:

> Finish the collection described in `/absolute/path/collect.json`. Tell me whether it completed, the unique record count and the total cents. Do not read the source pages into your conversation.

Expected answer: **complete, 3 unique records, 1 duplicate removed, 1,500 cents**. The response links to records, report and checkpoint files. For a partial result, ask the agent to resume using the returned checkpoint path without reading the checkpoint's rows into context.

For a real API, configure its response fields, cursor parameter and endpoint explicitly; see [the HTTP example](README.md#batch-collection). Prefer provider-side totals/filtering when available. The tool does not guess API behavior or automatically fetch data from accounts.

## 2. Recognize an unchanged failure loop

Save [guard-trace.json](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/packages/runtime/examples/guard-trace.json), then ask:

> Inspect `/absolute/path/guard-trace.json`. Should the next identical attempt run at the recorded unchanged state?

Expected answer: **block; 3 repeated failures**. Changing the measured state permits another attempt. The MCP tool analyzes a trace; developers use `RepeatGuard` / `runGuarded` to stop calls automatically in an agent host. It cannot intercept another application's tools just by being installed.

## 3. Turn tool progress into cache advice

Save [progress-trace.json](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/packages/runtime/examples/progress-trace.json), then ask:

> Analyze `/absolute/path/progress-trace.json`. Which session should receive the one available retention slot? Did this change GPU memory?

Expected answer: **retain `near`, release the hint for `slow`; no GPU memory changed**. The MCP tool writes a plan. Developers use `ProgressReporter` and `ProgressBridge` with a compatible inference engine for live application. Hosted-model API users generally cannot control this cache.

## Choose these tools when they fit

Use the collector for a configured multi-page job; the guard for repeated-failure traces or host integration; the cache planner for serving-engine integration. Use Read/Grep for small notes and obvious errors, and keep an existing correct script when it is sufficient. No model calls or telemetry occur inside these tools. Installation and explicit HTTP adapters use the network.
