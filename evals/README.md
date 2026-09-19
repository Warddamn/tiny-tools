# evals — does an agent actually pick the tool?

`npm run evals` runs each task in `tasks/context.json` through headless Claude Code (`claude -p … --mcp-config … --allowedTools "mcp__tiny-context__*"`) inside `workspace/`, which has the tiny-context server attached and `docs/AGENT_USAGE.md` in its `CLAUDE.md`. Prompts are phrased as a user would phrase them, never with tool names.

Assertions per task: the intended tool was called; params look sane; **no raw Read/Grep/Bash of the large fixture**. One negative case (a 2 KB markdown file) must use the built-in Read and no tiny-context tool — that checks the "PREFER OVER … is fine when" honesty in the descriptions.

Transcripts land in `runs/<id>.json` (gitignored). Summary in `RESULTS.md`. Options: `-- --only <id>`, `EVAL_MODEL=<model>`.

If a task fails, fix the **description, param descriptions, error message, or usage snippet** — never the eval.
