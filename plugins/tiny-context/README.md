# tiny-context plugin

Claude Code plugin that installs the [tiny-context](https://github.com/Warddamn/tiny-tools/tree/main/packages/context#readme) MCP server (eight local tools to outline, search, slice, query, cluster, diff, validate and extract from files, including PDF/DOCX/PPTX/XLSX) together with a skill that tells Claude when to use them instead of reading whole files.

Install: `/plugin marketplace add Warddamn/tiny-tools` then `/plugin install tiny-context@tiny-tools` (needs Node 20+; the server runs via `npx -y -p @tiny_tools_pw/context tiny-context-mcp`).
