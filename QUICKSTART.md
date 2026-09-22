# Give your agent a useful first task

Built by **AVRG3**. tiny-context helps most with large tables, long logs and PDF/Office documents. It must be connected to your agent before the agent can use it. A directory listing alone cannot do that.

## 1. Connect it

If your client supports MCPB bundles, open the [bundle release](https://github.com/Warddamn/tiny-tools/releases/tag/context-v0.1.1), choose your OS under **Assets**, download the `.mcpb` file and open it in that client. The client will show its installation and permission prompts. Otherwise use the commands below.

Use the [install instructions](README.md#install) for your app. Node.js 20+ is required; no npm account or token is needed. After setup, restart or reconnect your client and check that **tiny-context** is connected with **eight tools**. In Claude Code, the plugin also supplies guidance on when to use each tool. With manual setup, add the [agent usage snippet](packages/context/docs/AGENT_USAGE.md) to your project's instructions.

## 2. Try a task and check the answer

For a small, reproducible demo, download this repository with **Code → Download ZIP**, unzip it, and open that folder in your coding agent. These sample files are intentionally small so their answers are easy to check. For everyday use, ask the same kinds of questions about your own larger files.

**Spreadsheet question** — paste:

> Use tiny-context to count the rows with a negative total in packages/context/test/fixtures/sample.csv. Show the count and the SQL you used.

Expected: **2**. The tool call should be `query_table` with `SELECT COUNT(*) AS n FROM t WHERE total < 0` (or equivalent).

**PDF question** — paste:

> Use tiny-context to find the termination clause in packages/context/test/fixtures/sample.pdf. Cite the page and summarize the clause from that page.

Expected: termination is on **page 2**. `file_map` can orient the agent, `query_file` locates the clause, and `read_section` can read the page. A page citation lets you check its answer.

**Log question** — paste:

> Use tiny-context to explain the repeated errors in packages/context/test/fixtures/sample.log. Give the error count and the evidence from the log.

Expected: **8 upstream timeout errors**, each after **5000 ms**, with status **502**. `summarize_log` with `focus: "errors"` should find the cluster. The log does not establish why the upstream service timed out.

You should see the tool call in the agent's activity, followed by the answer. If it only gives advice or guesses, check its MCP connection and ask it to use the named tool. Once the setup works, use normal task prompts; use counts alone are not a goal.

## 3. Let the agent choose appropriately

Use the tools for a question about a large table, a section of a long document, recurring log errors, or a document comparison. For a short note or a known exact string in a text file, the agent's ordinary Read or Grep may be faster. Extra tool calls on those tasks are not a success.

The recorded comparison used 12 tasks and one run per setup. It found about 20% fewer tokens and 50% less elapsed time with tiny-context; that is evidence for those tasks, not a promise for every agent. See [the full comparison](evals/COMPARISON.md).

## If something goes wrong

- **Server cannot start:** check that Node.js 20+ and `npx` are available to the app, and allow the first download to finish. The install commands use the GitHub release because the npm package is not published.
- **File not found:** give the agent the absolute path to the file, or open the unzipped repository as its working folder.
- **Table tool missing DuckDB:** optional dependencies may have been disabled during installation; reinstall with optional dependencies enabled. The other seven tools do not require DuckDB.
- **Connected but unused:** check tool permissions and the agent usage snippet. A client can disable tools or omit their guidance.

## Help improve real-world adoption

A useful report includes the client and version, the kind and approximate size of the file, the question, whether the correct tool was chosen, whether the answer was right, and any installation error. Share a sanitized example in [a GitHub issue](https://github.com/Warddamn/tiny-tools/issues/new); do not upload private documents, credentials or full sensitive logs.

`npm run verify:release` is a maintainer check: from a fresh temporary npm cache, it launches the same public release command and checks all eight tools with known answers. Automated checks download the release too, so download totals do not measure human or agent adoption.
