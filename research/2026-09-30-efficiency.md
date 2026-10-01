# Efficiency review — September 30, 2026

Question: what useful deterministic work should tiny-tools add after current agent-tool releases? Review window: September 24–30, with explicitly dated older context. Public sources, synthetic fixtures, no company data.

## Current evidence

- [Claude Code 2.1.286, September 30](https://github.com/anthropics/claude-code/releases/tag/v2.1.286) fixes resumed-history loss after parallel tools, large-history startup and accounting errors. [2.1.285, September 29](https://github.com/anthropics/claude-code/releases/tag/v2.1.285) adds a cap for non-streaming timeout retries. Reliability and avoiding repeated work remain concrete needs. These are host-level fixes; a local file MCP should not pretend to replace them.
- [RTK development release, September 30](https://github.com/rtk-ai/rtk/releases/tag/dev-0.51.0-rc.480) confirms ongoing activity this week; it has no release body from which to infer new capabilities. The [project documentation](https://github.com/rtk-ai/rtk) already describes command-specific output filtering, grouping and deduplication. A generic command-output compressor would compete directly with an established tool.
- [Cursor's September 23 engineering report](https://cursor.com/blog/improved-token-efficiency) is recent background, one day outside this review window. It discusses smaller instructions, on-demand tool loading, cache reuse, compact file reads and delegation overhead, with measured total cost rather than only output-size claims. Adding a large new tool catalog would work against those lessons.
- [context-mode](https://github.com/mksglu/context-mode) already keeps large results outside active context and makes them retrievable. Its latest GitHub release at review time, [1.0.169](https://github.com/mksglu/context-mode/releases/tag/v1.0.169), is June 29, not a release this week. Its accounting corrections also illustrate why retrieval overhead must be included when reporting savings.
- [Token Optimizer MCP](https://github.com/ooples/token-optimizer-mcp) already offers context deltas, caches and file tools. Its own documentation reports that aggressive enforced routing can increase task cost. We therefore do not add a compulsory hook or claim to invent file deltas.
- [jd](https://github.com/josephburnett/jd) already supports structural JSON/YAML diffs and matching set objects by keys; [dyff](https://github.com/homeport/dyff) is another structured diff alternative. JSON change detection is established technology. The opportunity here is a bounded, explicit, dependable integration for agents already using tiny-tools.

## First-principles choice

Avoid sending unchanged information into the model. For recurring data checks, the question is often which records changed, not what all records contain. Reordered exports and volatile timestamps can make line diffs misleadingly large. A deterministic keyed comparison can answer that whole question in one existing tool call.

Chosen: extend `diff_files` with explicit record identity and optional field selection for JSON/JSONL snapshots. It produces complete counts, bounded previews and an optional complete change report. No extra model call, external service, dependency, permanent cache, background watcher or additional MCP tool. Ambiguous IDs and precision loss fail explicitly. Existing document/table modes remain available.

Not chosen: another general compression server, a semantic memory system, or provider-cache control. The first two have substantial existing competition and overhead; the last needs host/provider integration beyond what a local file server can deliver. Our existing runtime guards already address repeated failures.

## Evidence standard

Check additions, deletions, reordering, selected fields, missing versus null, composite IDs, duplicate keys, numeric precision, export safety, resource limits, and installed CLI/MCP behavior. Measure processing and response size against a prepared correct script as well as whole-file reading. The script can win; document that. Check real agent answers and a small-file negative case, recording the actual outcomes and limitations.

This review is a bounded sample of relevant primary sources, not an exhaustive survey of every tool released this week or evidence of an unsolved market monopoly. [Feature contract](../packages/context/docs/RECORD_DIFF.md) · [Benchmark](../bench/RECORDS.md) · [Agent results](../evals/RECORDS.md).
