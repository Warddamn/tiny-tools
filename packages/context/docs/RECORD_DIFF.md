# What actually changed in this export?

`diff_files` records mode compares two saved JSON/JSONL snapshots by stable record IDs. It ignores record order and JSON object-key order, then returns added, removed, changed and unchanged record counts with before/after previews. No model, network call, hidden session state or new dependency is involved. Available in **tiny-context 0.2.0**; the server still has eight tools.

Use it for recurring order exports, issue inventories, product catalogs, job results or API responses already saved locally. An export can reorder thousands of records while changing only three. A line diff will often show much more text than the actual changes.

```json
{"a":"/data/yesterday.json","b":"/data/today.json","mode":"records","key":["/id"],"fields":["/status","/quantity"],"out":"/data/changes.jsonl"}
```

`key` is required: `/id`, or multiple pointers such as `["/account", "/sku"]`. No guessed identity. Numbers and strings are different keys. A renamed ID counts as a removal and an addition.

`fields` is optional: omitting it compares all fields. Selecting `/status` and `/quantity` deliberately excludes changes elsewhere, such as timestamps. The response repeats that scope. A missing field differs from `null`, `false`, zero or an empty string. Nested array order remains significant; nested objects compare structurally. Without `fields`, a changed nested object is reported under its top-level field.

`records_path` selects a JSON array inside an API envelope, for example `/data/orders`. By default the JSON root is the records array. JSONL/NDJSON has one object per nonblank line and does not take `records_path`. Field/key locations use JSON Pointer: escape `/` in a property name as `~1`, and `~` as `~0`. Row locations are one-based record positions, excluding blank JSONL lines.

## Try a known answer

From a source checkout after building:

```sh
node packages/context/dist/cli.js diff packages/context/test/fixtures/orders-before.json packages/context/test/fixtures/orders-after.json --mode records --key /id --fields /status /quantity
```

Expected: **1 added (D), 1 removed (B), 1 changed (A: open → shipped), 1 unchanged (C)**. Timestamp changes are outside the chosen scope. The [public installer](../README.md#install) exposes the same command as `tiny-context diff` and the same operation over MCP.

## Complete results and refusal cases

Counts cover the whole comparison, even when previews are capped. `max_hunks` controls the number of record previews (default 20, maximum 100); the total response stays bounded and individual large record previews are labeled as clipped. Never treat a capped preview as every changed value.

Set `out` to save a complete local JSONL report: the first line contains the scope, sources and counts; subsequent lines contain one changed record each. Each field carries `before` and `after` cells with a `present` flag and its value when present. Existing output names get a collision suffix; inputs are never overwritten. Nothing is written without `out`.

Duplicate/missing/empty identity fields, duplicate JSON object keys, an absent selected field in both nonempty snapshots, invalid UTF-8, or numbers that JavaScript would silently round cause an explicit error. Store long numeric IDs and high-precision amounts as strings. Common representable decimal spellings such as `19.99` work; signed zero is normalized to zero, consistent with JSON report serialization. This is exact structured comparison within the declared scope, not a claim about financial arithmetic or semantic equivalence.

Limits: JSON/JSONL/NDJSON regular files only; 16 MiB and 100,000 records per file; nesting 64; 1,000,000 field checks; 200,000 changed fields; complete report 64 MiB. Split or filter larger snapshots. CSV/XLSX/PDF/Office comparisons continue to use existing summary/unified modes.

## When this helps—and when it adds work

Best fit: an agent needs a compact, validated answer from large snapshots and has no correct comparison script already prepared. Small files can be read directly. Existing `jq`, `jd`, SQL, scripts, or source-provided change feeds may be faster and sufficient; use them when appropriate. The compact serialized MCP instructions/tool catalog grew from 19,092 to 20,935 bytes (+1,843 bytes) versus 0.1.1. This is schema/instruction size, not measured model tokens; whether it is loaded up front depends on the client. This scans both local snapshots every call. It does not fetch incremental changes, skip local parsing, automatically monitor files, update another system, or promise lower total task cost.

[Reproducible benchmark](../../../bench/RECORDS.md) compares response sizes and processing time against both whole-file input and a prepared correct script. [Research and design choice](../../../research/2026-09-30-efficiency.md). [Agent checks](../../../evals/RECORDS.md).

Built by **AVRG3** · MIT
