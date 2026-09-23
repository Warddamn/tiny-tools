# tiny-runtime — MCP tools for API pagination, retry loops and tool progress

Three deterministic helpers for agent developers, built by **AVRG3**: finish paginated jobs, interrupt repeated work that makes no progress, and report tool progress to a cache scheduler. No model calls, training, accounts, or telemetry.

**Version 0.1.1:** library, CLI and a separate three-tool MCP server. No model calls or telemetry. The cache bridge requires a compatible inference-serving integration; it does not control hosted-model caches or stock vLLM by itself.

[Find a tool by task, with example inputs](../../discovery/README.md) · [Actual tool schemas](https://raw.githubusercontent.com/Warddamn/tiny-tools/main/discovery/catalog.json) · [Public install](#public-install).

## Public install

Requires **Node.js 20+**. No npm account or source checkout is needed.

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tiny-runtime&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi1wIiwiaHR0cHM6Ly9naXRodWIuY29tL1dhcmRkYW1uL3RpbnktdG9vbHMvcmVsZWFzZXMvZG93bmxvYWQvcnVudGltZS12MC4xLjEvdGlueS1ydW50aW1lLTAuMS4xLnRneiIsInRpbnktcnVudGltZS1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522tiny-runtime%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522-p%2522%252C%2522https%253A%252F%252Fgithub.com%252FWarddamn%252Ftiny-tools%252Freleases%252Fdownload%252Fruntime-v0.1.1%252Ftiny-runtime-0.1.1.tgz%2522%252C%2522tiny-runtime-mcp%2522%255D%257D)

**Claude Code:**

```bash
claude mcp add tiny-runtime -- npx -y -p https://github.com/Warddamn/tiny-tools/releases/download/runtime-v0.1.1/tiny-runtime-0.1.1.tgz tiny-runtime-mcp
```

**Cursor, Claude Desktop and other stdio MCP clients:** add this server configuration. VS Code uses `servers` in place of `mcpServers`.

```json
{"mcpServers":{"tiny-runtime":{"command":"npx","args":["-y","-p","https://github.com/Warddamn/tiny-tools/releases/download/runtime-v0.1.1/tiny-runtime-0.1.1.tgz","tiny-runtime-mcp"]}}}
```

**MCPB-compatible clients:** download the [portable bundle](https://github.com/Warddamn/tiny-tools/releases/download/runtime-v0.1.1/tiny-runtime-0.1.1.mcpb) and open it. It includes dependencies for macOS, Windows and Linux; a Node.js runtime is required. Bundles are unsigned; release checksums and registry hashes verify integrity. The smaller npx tarball downloads third-party dependencies at installation.

**Claude Code plugin:** `/plugin marketplace add Warddamn/tiny-tools`, then `/plugin install tiny-runtime@tiny-tools`. This adds the usage guidance as well. Choose either the plugin or manual MCP setup.

[Three worked examples with expected answers](QUICKSTART.md) · [GitHub downloads](https://github.com/Warddamn/tiny-tools/releases/tag/runtime-v0.1.1) · [Official MCP Registry](https://registry.modelcontextprotocol.io/?q=io.github.Warddamn%2Ftiny-runtime)

**JavaScript/TypeScript library:** install the same public tarball with `npm install https://github.com/Warddamn/tiny-tools/releases/download/runtime-v0.1.1/tiny-runtime-0.1.1.tgz`, then import `collectPages`, `RepeatGuard` or `ProgressBridge` from `@tiny_tools_pw/runtime`. This is a GitHub-hosted package, not an npm registry listing.

## What each part does

- **`collect_pages` / `collectPages`:** follows a configured cursor source, validates whole pages, deduplicates by an optional record ID, aggregates exact integer fields, and returns `complete`, `partial`, or `failed`. Durable checkpoints let a new run pick up after the last committed page.
- **`check_progress` / `RepeatGuard` / `runGuarded`:** compares actions against trusted state fingerprints. It blocks the fourth repeated stall by default, permits another test after a real edit, and recognizes repeated state transitions. Trace analysis is advisory; the SDK wrapper enforces the decision before executing a tool.
- **`plan_cache` / `ProgressReporter` / `ProgressBridge`:** reports measured work units without sending tool contents to a model. It estimates remaining time conservatively, considers parallel calls together, and emits expiring `retain`, `prefetch`, or `release` hints. A host adapter applies them; the MCP tool only writes a plan.

These solve known engineering problems, not previously empty categories. MCPProxy already has batching/pagination recipes; other projects implement loop detection and caching. This package focuses on explicit failure semantics, reusable integration, and tests. It is not a generic proxy for every MCP server.

## Run from a checkout

Requires Node.js 20+. From the repository root:

```bash
npm ci
npm run build
npm run demo:runtime
node packages/runtime/dist/cli.js collect packages/runtime/examples/collect.json --output-dir /tmp/runtime-results
node packages/runtime/dist/cli.js check packages/runtime/examples/guard-trace.json --output-dir /tmp/runtime-results
node packages/runtime/dist/cli.js plan packages/runtime/examples/progress-trace.json --output-dir /tmp/runtime-results
```

Each job creates its own directory and returns absolute artifact paths. CLI exit code is 0 for successful work and 1 for an error or incomplete collection. Partial records and their checkpoint remain available. No input file is overwritten. Job output files use owner-only permissions where supported; the parent directory's permissions still matter.

For an MCP client, replace the example path with your checkout's actual path:

```json
{"mcpServers":{"tiny-runtime":{"command":"node","args":["/absolute/path/tiny-tools/packages/runtime/dist/mcp.js"]}}}
```

Add [the eight-line usage snippet](docs/AGENT_USAGE.md) to your agent instructions. For automatic operation without additional model turns, integrate the SDK rather than asking the model to repeatedly call trace-analysis tools.

## Batch collection

The included `examples/collect.json` reads a local synthetic page manifest. A file source is an object containing `pages`, each with a request `cursor` (`null` for the first page) and a `page` containing `items` and **required** `nextCursor`. Only explicit `nextCursor: null` means the source is exhausted. Empty pages may still have a next cursor. File paths in a config are resolved relative to that config.

A configured HTTP source uses GET only, on exactly the supplied origin/path. Example (the domain is a placeholder, not a real service):

```json
{
  "source": {
    "type": "http",
    "url": "https://api.example.com/records?status=open",
    "itemsPath": "data.records",
    "nextCursorPath": "pagination.next_cursor",
    "cursorParam": "cursor",
    "totalPath": "pagination.total",
    "snapshotPath": "snapshot_id",
    "bearerEnv": "RECORDS_API_TOKEN",
    "scope": "account-and-filter-identity"
  },
  "key": "id",
  "sumFields": ["amount_cents"],
  "maxPages": 100,
  "maxRecords": 10000,
  "maxBytes": 16000000,
  "timeoutMs": 30000
}
```

`totalPath`, `snapshotPath`, and `bearerEnv` are optional. If configured, missing metadata fails the page. Paths use dot-separated own object keys; literal keys containing dots are unsupported. API mapping is explicit, never guessed. Returned cursors remain opaque query-parameter values, not URLs. Redirects are rejected. Keep authentication in the tool host environment; configs and checkpoints never store the resolved bearer token. Use HTTPS except for explicit local test endpoints. Do not put secrets in URL query parameters.

Prefer provider-side aggregation/filtering to fetching unnecessary records. APIs using Link headers, offsets, GraphQL POST, or tool-specific protocols need a small SDK adapter:

```js
import { collectPages } from '@tiny_tools_pw/runtime';
const result = await collectPages({
  sourceId: 'account/dataset/filter/version',
  key: 'id',
  sumFields: ['amount_cents'],
  fetchPage: async (cursor, signal) => {
    const response = await yourReadOnlyClient.list({ cursor, signal });
    return { items: response.records, nextCursor: response.next ?? null };
  }
});
```

Only map absent `response.next` to null when the provider's documented contract says it means the end. Callbacks must honor AbortSignal to stop their own I/O. The collector returns promptly even if an adapter ignores cancellation, but cannot kill arbitrary callback work.

Resume a CLI collection:

```bash
node packages/runtime/dist/cli.js collect /absolute/path/job.json --checkpoint /absolute/path/tiny-runtime-abc/checkpoint.json
```

Every accepted page is checkpointed before requesting another. `timeoutMs` covers collection, fetches and awaited callbacks; job setup, validation and safe filesystem finalization add overhead. Arbitrary synchronous callbacks cannot be interrupted, and timed-out custom adapters must stop their own work. MCP clients that request progress receive committed-page notifications; cancellation stops further requests and preserves committed work. Resumption creates a fresh directory, preserving the original checkpoint. `maxPages` is per invocation; record and byte budgets include previously committed pages. Increase limits to accept an oversized page; the collector never saves half a page. Default maximum response page size for HTTP is 1 MB (hard cap 8 MB), records 10,000 (hard cap 100,000), collection bytes 16 MB (hard cap 64 MB), and timeout 30 seconds (hard cap 5 minutes). No automatic retries, backoff, parallel fetching, or writes to the source.

With `key`, identical duplicates are counted once, and conflicting versions of an ID fail the entire new page. Without `key`, all rows are preserved. Declared `total` must refer to unique records when a key is used, all rows otherwise, and remain constant. Sums use BigInt internally and return strings; use integer minor units such as cents or integer strings, not rounded decimal numbers. Use tiny-context's query_table for decimal/statistical work.

**Completeness has a precise limit:** `complete` means the configured source explicitly ended and all configured metadata checks passed. It cannot expose hidden provider limits, a lying total, or missing records in the source. A stable snapshot/total improves evidence. Resume requires the same source/mapping/scope and aggregation; update scope when accounts or filters change. Checkpoint SHA-256 detects accidental corruption, not malicious tampering. Checkpoints contain records and cursors and should be protected like the source data. The CLI/MCP jobs write one immutable page delta and a small atomic commit pointer per page, then one compatible version-1 snapshot on return. Interrupted jobs retain a version-2 journal; keep its entire job directory together and resume via the CLI/MCP or `readCheckpoint(path)`. Old version-1 snapshots still work. Journal recovery caps total JSON bytes read at 128 MB (64 MB per file), independently of untrusted metadata counters; the SDK can request a smaller read budget. SDK users can pass `new CheckpointStore(freshDirectory).save` as `onPage` after `initialize(checkpoint)`; call `drain()` before finalizing. The older `onCheckpoint` callback remains snapshot-based and can be expensive on long jobs.

## Repeated-work guard

A trace is `{ "observations": [...], "nextAttempt": {...}, "options": {...} }`; see `examples/guard-trace.json`. Each observation includes `attempt` (`scope`, `tool`, JSON `args`, optional `state`), `outcome`, and optional `stateAfter`. Use `fingerprint()` over measured file/repository state, an etag, or a source version. Include every dependency that can change whether the operation succeeds. An incomplete fingerprint can cause false positives. Never accept a model's self-reported “I made progress” as evidence.

```js
import { RepeatGuard, runGuarded, fingerprint } from '@tiny_tools_pw/runtime';
const guard = new RepeatGuard({ threshold: 3, window: 100 });
const attempt = { scope: workflowId, tool: 'run_tests', args: { suite: 'unit' }, state: fingerprint(await measuredInputs()) };
const result = await runGuarded(guard, attempt, () => runTests(), async () => fingerprint(await measuredInputs()), result => result.exitCode === 0);
if (!result.executed) reportBlocked(result.decision);
```

`runGuarded` never retries or swallows execution exceptions. Use it serially per workflow; it is not a concurrent-call deduplicator. Without a trusted state fingerprint, repeated failures yield advice, never a block. Host-approved polling can use `repeatableTools`; configure this in trusted host code. Successful reads of unchanged state remain allowed and reset preceding failed attempts. A state change naturally permits a new attempt. `guard.clear(scope)` explicitly resets history. Snapshots contain bounded hashes, not arguments or raw outputs, but hashing predictable inputs is not anonymization. Restore a snapshot by passing it as the constructor's second argument. Detection is a bounded heuristic, not proof that every repeat is unnecessary.

## Live progress and cache bridge

See `examples/demo.mjs` for an executable combined integration. The live SDK path is:

```js
import { CachePlanner, ProgressReporter, ProgressBridge, httpCacheAdapter } from '@tiny_tools_pw/runtime';
const planner = new CachePlanner();
const reporter = new ProgressReporter(sessionId, uniqueCallId, event => planner.ingest(event));
const bridge = new ProgressBridge(planner, httpCacheAdapter('http://127.0.0.1:8089/cache-hints'));
reporter.report('running', 0, 100);
// Tool adapter reports actual units as work advances.
reporter.report('running', 90, 100);
await bridge.tick(Date.now(), 4); // capacity is session slots, not GPU bytes
reporter.report('done', 100, 100);
await bridge.tick(Date.now(), 4);
```

The bridge coalesces simultaneous ticks and unchanged hints, renewing acknowledged leases halfway through their lifetime. Delivery has bounded concurrency (default 4), a 2-second deadline capped by lease expiry, and checks expiry before dispatch and after acknowledgement. Failed/late acknowledgements are not reported as applied. Adapters must enforce lease expiry and honor cancellation; an uncooperative adapter can continue its own work. HTTP adapters require Unix-millisecond timestamps.

The host calls `tick` periodically while work runs and once at completion; own the lifecycle in your runtime. Always report a terminal `done`, `failed`, or `cancelled` event. Session/call IDs should be opaque; no prompts, file paths, results, or document contents are sent. Timestamps share the controller's millisecond clock domain; normalize remote clocks at the trusted boundary. Events have monotone per-call sequence numbers. Duplicates, out-of-order events, future timestamps and stale reports are rejected. IDs must be unique per call.

The planner needs two advancing measurements with the same total before estimating remaining time. Stalls, regressions, unknown totals and overdue predictions fall back to unknown. `finishing` is an explicit near-completion hint; only trusted instrumented code should emit it. For parallel calls, the last active call controls readiness. Defaults: stale after 5 seconds, near completion within 1 second, lease up to 2 seconds, at most 1,000 sessions / 5,000 calls. Use a reasonable retention capacity, tick rate and quotas for your workload.

**Custom serving adapter contract:** `httpCacheAdapter` POSTs `{version:1, session, action, reason, estimatedRemainingMs, validUntilMs}` to the explicitly configured endpoint and requires a 2xx response. The serving integration maps opaque session IDs to its own KV-cache state, enforces its own memory budget and authorization, and treats `validUntilMs` as a hard lease expiry even if release delivery fails. `release` relinquishes our hint; it must not destroy correctness-critical state. Unknown/stale sessions fall back to the engine's normal policy. Both retain and prefetch are advisory priorities, not unlimited reservations. Errors are returned per session. POSTs are bounded by a timeout; redirects are disabled. A 2xx confirms endpoint acceptance, not measured GPU performance.

This is our integration protocol, not an existing vLLM API. The package contains no GPU engine patch. It implements the reporter/controller/adapter side and tests it against an actual local HTTP endpoint; deployment must supply the engine side. Hosted-model customers generally cannot control this cache. The underlying research's reported latency gains are not results for this implementation. Unequal tool work units, misleading progress, resource contention and adversarial sessions require workload-specific validation and engine-level quotas.

## Verification and size

`npm test` covers library failures, real local HTTP sources, checkpoint resumption, CLI exit behavior and all three tools through a real MCP stdio client. `npm run demo:runtime` shows all three together. `npm run bench:runtime` compares the collector with an ordinary correct script using synthetic data.

On this development machine, five runs over 10,000 synthetic rows / 100 pages produced the same 495,000-cent sum: plain script 0.46–1.07 ms, collector 30.68–39.62 ms. No network delays, disk checkpoint I/O or model calls are included. Validation has a CPU cost; a correct existing script is faster on that easy case. A synthetic unchanged-failure scenario executes three of 100 attempted calls and blocks 97; this demonstrates policy behavior, not measured real-world savings. There is no measured token/API-cost reduction, broad agent-adoption evidence, or production GPU result for this package yet.

No new dependency family or native binary: Zod validates untrusted data; the existing official MCP SDK provides stdio; Commander provides CLI parsing. The SDK's transitive HTTP packages are installed even though this server only exposes stdio. Actual package and production-install sizes are recorded during fresh-install verification in `docs/VALIDATION.md`.

Built by **AVRG3** · MIT
