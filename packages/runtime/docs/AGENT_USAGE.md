## tiny-runtime (installed MCP)
- Use collect_pages for multi-page jobs with a configured source; inspect complete/partial/failed before answering from totals.
- Resume partial jobs by passing the checkpoint path unchanged; do not Read checkpoints or source pages into model context. Prefer source-side filtering and aggregation when available; do not fetch rows unnecessarily.
- Use check_progress for long repeated-failure traces; supply state fingerprints from the host, not model-written claims of progress.
- Use plan_cache only for serving-engine integration/replay; it produces advice, not GPU changes or hosted-model savings.
- Integrate RepeatGuard/runGuarded and ProgressReporter/ProgressBridge into the host for automatic behavior without extra model turns.
- A single request, an existing correct script, a small obvious failure, and ordinary hosted-model use are better handled with built-ins.
- Keep credentials in host environment variables. Configs, checkpoints and traces can be sensitive; only read explicit sources.
