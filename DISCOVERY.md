# Discovery status and maintenance

Built by **AVRG3**. For tool selection and installation, start with the [task guide](discovery/README.md).

## Public entry points

- **GitHub:** [repository](https://github.com/Warddamn/tiny-tools), task guide, per-server READMEs, worked examples, pinned public releases, `llms.txt`, `discovery/catalog.json` and `discovery/mcp.json`.
- **Official MCP Registry:** `io.github.Warddamn/tiny-context` and `io.github.Warddamn/tiny-runtime`, published at version 0.1.1. Publication jobs on September 22, 2026 verified active entries and hashes against GitHub releases. The registry API timed out during the September 23 recheck; that is not evidence the entries were removed.
- **Glama:** [repository profile](https://glama.ai/mcp/servers/Warddamn/tiny-tools). On September 23 the public profile existed, but its [schema page](https://glama.ai/mcp/servers/Warddamn/tiny-tools/schema) said capabilities had not been inspected and showed no tools; deployment was unavailable. Profile existence alone does not establish a searchable, successfully inspected listing.
- **npm:** not published. All active installation instructions use GitHub releases and need no npm account/token. npm publication is not a prerequisite for our current registry entries.

## Directory inspection support

The root Dockerfile provides an explicit default tiny-context build and a separate `tiny-runtime` target. Both run the real stdio MCP server as an unprivileged user. CI checks the generated catalog and invokes every tool in these images with networking disabled, read-only inputs and temporary writable outputs.

[Glama's documented pipeline](https://glama.ai/mcp/methodology) builds and introspects servers, using a maintainer Dockerfile when available. It says failed inferred builds keep their profiles but are withheld from search. The previous missing tool inventory is consistent with an incomplete inspection; we do not have Glama's build logs to establish the exact cause. The explicit tested build removes the need to infer our workspace setup. Glama must still re-inspect and index it on its own systems.

The generated JSON catalog is also directly accessible to web-reading agents without relying on a directory's tool inventory. It is a project-specific document, not a standardized auto-install service. Connecting a local tool still requires the client's setup and permission.

## Keep descriptions useful

Lead with actual tasks: PDF/Office passage search, SQL over CSV/Excel/Parquet, repeated log errors, document comparison, resumable API pagination and repeated-failure traces. Include input examples, bounded outputs, installation and when an ordinary built-in is simpler. Do not promise universal time/token/GPU savings, automatic client installation, directory ranking or confirmed adoption.

After changing a server's descriptions, schemas, version or registry metadata:

```bash
npm run discovery:catalog
npm run discovery:check
```

The catalog comes from actual `initialize` and `tools/list` responses. CI rejects stale catalog/config files. For a version change, follow [RELEASE.md](RELEASE.md) and publish matching release assets before claiming the new pinned install is available. The discovery workflow verifies source and containers; it does not publish a package release or download public software archives.

## Measure without inventing users

`npm run stats` reads GitHub release counters and available traffic. Public release counters measure downloads of files; they do not identify downloaders or prove a successful installation or task. Automated inspection, our own tests, repeated downloads and real users can all contribute. Missing private traffic is unavailable, not zero. No tool telemetry is added.

Independent reports of useful tasks, integrations or reproducible results are stronger adoption evidence. A directory page and passing tests establish availability and verification within their scope, not demand.

The [September 19 research plan](https://github.com/Warddamn/tiny-tools/blob/2fb28b357d018e1d3262ab92ffe9c6656ded6ceb/DISCOVERY.md) is historical and superseded by this page. In particular, its npm-as-prerequisite guidance and download-to-user estimates should not be used.
