# Saved document profiles

Reuse reading rules for recurring labeled forms and reports. An agent writes a small local JSON profile once, then calls `extract` on a batch. No model training, automatic template inference, paid API call, network request or telemetry. The profile stores labels/types, not example values or document contents. Your selected labels/anchors can themselves be private: keep the profile local unless you choose to share it.

This is an opt-in addition to the existing `extract` tool. It does not add another MCP tool. Prefer a normal read for one small file or an existing correct extraction script. Setup takes work and can cost agent tokens; reuse across multiple batches is the intended case. Each document is still parsed and checked on every call. It does not cache documents or learn silently.

## Save once, reuse in one call

Have your agent inspect representative examples and save this JSON using its usual Write tool/editor. Keep it outside the document glob. All fields are required; edit labels and anchors to match your documents. The example below matches a report containing these four lines, in any order:

```text
Monthly report
Reference: A-001
Total: 1234.50
Date: 2026-09-30
```

```json
{
  "version": 1,
  "name": "Monthly reports v1",
  "formats": ["text", "markdown", "docx", "pdf"],
  "anchors": ["Monthly report"],
  "fields": [
    { "name": "reference", "label": "Reference:", "type": "text" },
    { "name": "total", "label": "Total:", "type": "decimal" },
    { "name": "date", "label": "Date:", "type": "date" }
  ]
}
```

Test it on several representative files, including a known wrong type. Check values and locations before adopting it. Then reuse its path for future batches:

```json
{
  "paths": ["/abs/reports/*.docx"],
  "profile": "/abs/profiles/monthly-v1.json",
  "out": "/abs/results/monthly.jsonl"
}
```

CLI: `tiny-context extract '/abs/reports/*.docx' --profile /abs/profiles/monthly-v1.json --out /abs/results/monthly.jsonl`

The response contains counts, a bounded preview, and the complete report path. The JSONL file begins with a summary and the profile's SHA-256, followed by one row per unique resolved document path. Values remain strings: `9007199254740993.10` is not converted to a rounded floating-point number. Every value has a source line, paragraph or page location. Use your own exact arithmetic for totals if needed; this operation does not aggregate money.

Rows have `status: "matched"` or `"needs_review"`. A failed row has reasons and **no fields**, so a partially valid result cannot masquerade as complete. Handle the review count explicitly. There is no automatic AI fallback. Keep a stable profile name/version and save a new profile when changing its rules.

## Matching contract and limits

- The extracted text is trimmed at line ends. Matching is case-sensitive and literal. Every anchor must be a complete line; every field label must end with `:` and start a line. A value must be on the same line. Labels may move, but must occur exactly once per document—even identical duplicate values need review. Interior spacing and wording are not guessed.
- All anchors and all 1–16 fields are required. Profile files accept only the documented keys. `text` is the default type; values must be nonempty and at most 512 characters. `decimal` accepts a signed plain decimal string, without currency/group separators or exponent notation. `date` requires a valid `YYYY-MM-DD` calendar date.
- TXT/Markdown, DOCX and PDFs with usable text layers are supported. No OCR, spreadsheets, tables/line items, multi-line clauses, positional layouts or semantic contract understanding. Scans, fragmented PDF reading order and changed labels may require a different tool or review.
- Matching validates only the specified anchors and fields. It does **not** detect every layout/content change, prove that values are true, or establish that surrounding wording has the same meaning. New text elsewhere may be ignored. Use `diff_files` for document comparison.
- Up to 100 resolved files, 2 MiB source and extracted text per document, 16 MiB admitted source bytes per batch, 50,000 extracted lines, 16 KiB profile JSON, 8 anchors. Smaller batches are the next step when limits are reached. A separate parser process has a 15-second deadline and 256 MiB JS heap limit; this is not an OS sandbox or a total native-memory limit.
- Default preview: 20 whole rows, about 15 KB total. Review items appear first; the complete report retains resolved input order. `max_matches` adjusts row count; byte bound still applies. `omitted` is explicit. Set `out` for all rows, otherwise no result file is written. Existing reports get a suffix; input/profile files are never overwritten. Reports are created with private permissions where supported.
- Do not combine `profile` with `pattern`, `jq`, `kind`, `ignore_case` or `dedupe`. Existing extraction modes retain their behavior; `out` applies only to profiles.

## Cost and evidence

Profiles save repeated rule discovery and can combine many field/file requests. They still add setup, validation and process startup. Smaller returned text is **not** proof of a smaller model bill. The response ledger compares bytes with entire documents and excludes agent turns, profile creation, tool definitions and prompt caching.

[Reproducible synthetic measurements](../../../bench/PROFILES.md) include one-time profile save/read, the batch operation, a prepared-script alternative, tiny inputs and mismatches. They measure local execution and payload sizes, not billed inference. [A bounded live-agent check](../../../evals/PROFILES.md) found lower reported cost/time for one recurring batch with an existing profile; it excludes profile creation and does not establish general savings. No blanket cost-saving claim is made. Earlier keyed-comparison agent trials were faster but more expensive; [those results remain available](../../../evals/RECORDS.md).

Reusable extraction templates already exist, for example [invoice2data](https://github.com/invoice-x/invoice2data). This is a small local recipe path within Tiny Tools, not a claim to have invented document templates.

Built by **AVRG3** · MIT
