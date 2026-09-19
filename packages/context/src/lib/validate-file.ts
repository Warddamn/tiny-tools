// @author AVRG3
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { decodeText, fmtInt, isProbablyBinary, parseCsv, pathExists, resolveInputs, teach, toAbsolute, truncateLine } from "@tinytools/shared";
import type { ValidateFileArgs } from "../schemas.js";
import type { LibResult } from "./result.js";

interface Report {
  checks: string[];
  problems: string[];
  warnings: string[];
}

function lineOf(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function jsonErrorLocation(text: string, message: string): string {
  const lc = /\(line (\d+) column (\d+)\)/.exec(message);
  if (lc) return `line ${lc[1]}, column ${lc[2]}`;
  const pos = /position (\d+)/.exec(message);
  if (pos) {
    const p = parseInt(pos[1]!, 10);
    const line = lineOf(text, p);
    const col = p - text.lastIndexOf("\n", p - 1);
    return `line ${line}, column ${col}`;
  }
  return "unknown position";
}

type Validator = ((d: unknown) => boolean) & { errors?: Array<{ instancePath: string; message?: string; params?: Record<string, unknown> }> | null };
interface AjvLike {
  compile(s: unknown): Validator;
}

async function checkJsonSchema(data: unknown, schemaPath: string, r: Report): Promise<void> {
  const abs = toAbsolute(schemaPath);
  if (!(await pathExists(abs))) throw teach(`Schema not found: ${abs}`, "Pass the path of a JSON Schema file.");
  let schema: unknown;
  try {
    schema = JSON.parse(await fs.readFile(abs, "utf8"));
  } catch (e) {
    throw teach(`Schema ${abs} is not valid JSON: ${(e as Error).message}`, "Fix the schema file first (validate_file on it shows where).");
  }
  const declared = (schema as { $schema?: unknown }).$schema;
  const is2020 = typeof declared === "string" && /2020-12/.test(declared);
  const mod = (is2020 ? await import("ajv/dist/2020.js") : await import("ajv")) as unknown as { default: new (o: object) => AjvLike };
  const ajv = new mod.default({ allErrors: true, strict: false });
  let validate: Validator;
  try {
    validate = ajv.compile(schema);
  } catch (e) {
    throw teach(`Schema ${path.basename(abs)} could not be compiled: ${(e as Error).message}`, "Check the schema against the JSON Schema spec (draft-07 or 2020-12).");
  }
  r.checks.push(`json-schema (${path.basename(abs)})`);
  if (!validate(data)) {
    const errors = validate.errors ?? [];
    for (const err of errors.slice(0, 30)) {
      const where = err.instancePath || "(root)";
      const extra = err.params && "additionalProperty" in err.params ? ` '${String(err.params["additionalProperty"])}'` : "";
      r.problems.push(`schema: ${where} ${err.message ?? "invalid"}${extra}`);
    }
    if (errors.length > 30) r.problems.push(`schema: … +${errors.length - 30} more errors`);
  }
}

function githubSlug(title: string, seen: Map<string, number>): string {
  let s = title
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  const n = seen.get(s) ?? 0;
  seen.set(s, n + 1);
  if (n > 0) s = `${s}-${n}`;
  return s;
}

async function checkLinks(text: string, file: string, isHtml: boolean, r: Report): Promise<void> {
  const dir = path.dirname(file);
  const anchors = new Set<string>();
  if (isHtml) {
    for (const m of text.matchAll(/\b(?:id|name)="([^"]+)"/g)) anchors.add(m[1]!);
  } else {
    const seen = new Map<string, number>();
    let inFence = false;
    for (const line of text.split("\n")) {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) continue;
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) anchors.add(githubSlug(h[2]!, seen));
    }
    for (const m of text.matchAll(/<(?:a|h\d|div|span|section)\b[^>]*\b(?:id|name)="([^"]+)"/g)) anchors.add(m[1]!);
  }
  const targets: Array<{ target: string; index: number; kind: "link" | "image" }> = [];
  if (isHtml) {
    for (const m of text.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)) targets.push({ target: m[1]!, index: m.index ?? 0, kind: "link" });
    for (const m of text.matchAll(/<(?:img|script|source|video|audio)\b[^>]*\bsrc="([^"]*)"/gi)) targets.push({ target: m[1]!, index: m.index ?? 0, kind: "image" });
    for (const m of text.matchAll(/<link\b[^>]*\bhref="([^"]*)"/gi)) targets.push({ target: m[1]!, index: m.index ?? 0, kind: "image" });
  } else {
    for (const m of text.matchAll(/(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) targets.push({ target: m[2]!, index: m.index ?? 0, kind: m[1] ? "image" : "link" });
    for (const m of text.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm)) targets.push({ target: m[1]!, index: m.index ?? 0, kind: "link" });
    for (const m of text.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/gi)) targets.push({ target: m[1]!, index: m.index ?? 0, kind: "image" });
    for (const m of text.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)) targets.push({ target: m[1]!, index: m.index ?? 0, kind: "link" });
  }
  let external = 0;
  let checked = 0;
  for (const t of targets) {
    const target = t.target.trim();
    if (!target || /^(https?:|mailto:|tel:|data:|ftp:|javascript:|\/\/)/i.test(target)) {
      if (target) external++;
      continue;
    }
    const line = lineOf(text, t.index);
    if (target.startsWith("#")) {
      checked++;
      let anchor = target.slice(1);
      try {
        anchor = decodeURIComponent(anchor);
      } catch {
        /* keep */
      }
      if (!anchors.has(anchor) && !anchors.has(anchor.toLowerCase())) {
        const have = anchors.size ? ` (have: ${[...anchors].slice(0, 8).map((a) => `#${a}`).join(", ")}${anchors.size > 8 ? ", …" : ""})` : "";
        r.problems.push(`line ${line}: anchor #${anchor} not found in this file${have}`);
      }
      continue;
    }
    checked++;
    let rel = target.replace(/[?#].*$/, "");
    try {
      rel = decodeURIComponent(rel);
    } catch {
      /* keep */
    }
    if (!rel) continue;
    const candidates = rel.startsWith("/") ? [path.join(dir, rel), rel] : [path.resolve(dir, rel)];
    let ok = false;
    for (const c of candidates) if (await pathExists(c)) ok = true;
    if (!ok) {
      const lookedIn = path.resolve(dir, rel.startsWith("/") ? `.${rel}` : rel);
      r.problems.push(`line ${line}: ${t.kind === "image" ? "missing image/asset" : "broken link"} → ${target} (looked in ${lookedIn})`);
    }
  }
  if (external) r.warnings.push(`${external} external URL${external === 1 ? "" : "s"} not checked (use verify.check_links with external: true)`);
  r.checks.push(`links (${checked} internal checked)`);
}

export async function validateFile(args: ValidateFileArgs): Promise<LibResult> {
  const [file] = await resolveInputs(args.path);
  const buf = await fs.readFile(file!);
  const ext = path.extname(file!).toLowerCase();
  const r: Report = { checks: ["encoding"], problems: [], warnings: [] };

  if (isProbablyBinary(buf)) {
    r.problems.push("binary content (NUL bytes) — not a text file");
    return finishReport(file!, r, buf.length);
  }
  const { text, bom } = decodeText(buf);
  if (bom === "utf8") (ext === ".json" ? r.problems : r.warnings).push(`UTF-8 BOM at byte 0${ext === ".json" ? " — JSON parsers reject it; save without BOM" : " — most tools prefer no BOM"}`);
  if (bom === "utf16le" || bom === "utf16be") r.warnings.push(`${bom.toUpperCase()} encoding — most tools expect UTF-8`);
  if (!bom) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      r.problems.push("invalid UTF-8 byte sequence — re-save the file as UTF-8");
    }
  }
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  if (crlf && lf) r.warnings.push(`mixed line endings (${fmtInt(crlf)} CRLF, ${fmtInt(lf)} LF)`);

  let data: unknown;
  let parsedOk = false;
  if (ext === ".json") {
    r.checks.push("json-syntax");
    try {
      data = JSON.parse(text);
      parsedOk = true;
    } catch (e) {
      const msg = (e as Error).message;
      r.problems.push(`${jsonErrorLocation(text, msg)}: ${msg.replace(/ in JSON at position \d+.*$/, "").replace(/ \(line \d+ column \d+\)$/, "")}`);
    }
  } else if (ext === ".jsonl" || ext === ".ndjson") {
    r.checks.push("jsonl-syntax");
    let bad = 0;
    text.split("\n").forEach((l, i) => {
      if (!l.trim()) return;
      try {
        JSON.parse(l);
      } catch (e) {
        bad++;
        if (bad <= 20) r.problems.push(`line ${i + 1}: ${(e as Error).message.replace(/ in JSON at position \d+.*$/, "")}`);
      }
    });
    if (bad > 20) r.problems.push(`… +${bad - 20} more bad lines`);
  } else if (ext === ".yaml" || ext === ".yml") {
    r.checks.push("yaml-syntax");
    const yaml = await import("yaml");
    const doc = yaml.parseDocument(text, { prettyErrors: true });
    for (const err of doc.errors) {
      const lp = err.linePos?.[0];
      r.problems.push(`${lp ? `line ${lp.line}, column ${lp.col}` : "?"}: ${err.message.split("\n")[0]}`);
    }
    for (const w of doc.warnings) r.warnings.push(w.message.split("\n")[0]!);
    if (doc.errors.length === 0) {
      data = doc.toJS();
      parsedOk = true;
    }
  } else if (ext === ".xml" || ext === ".svg" || ext === ".xhtml" || ext === ".xsd" || ext === ".plist") {
    r.checks.push("xml-wellformed");
    const { XMLValidator } = await import("fast-xml-parser");
    const res = XMLValidator.validate(text, { allowBooleanAttributes: true });
    if (res !== true) r.problems.push(`line ${res.err.line}, column ${res.err.col}: ${res.err.msg}`);
  } else if (ext === ".csv" || ext === ".tsv") {
    const rows = parseCsv(text);
    if (rows.length === 0) {
      r.checks.push("csv-structure");
      r.problems.push("file is empty");
    } else {
      const header = rows[0]!;
      const width = header.length;
      const empties = header.map((h, i) => (h.trim() ? null : i + 1)).filter((x): x is number => x !== null);
      if (empties.length) r.warnings.push(`header has empty column name${empties.length > 1 ? "s" : ""} at position${empties.length > 1 ? "s" : ""} ${empties.join(", ")}`);
      const dupes = header.filter((h, i) => header.indexOf(h) !== i);
      if (dupes.length) r.warnings.push(`duplicate header names: ${[...new Set(dupes)].join(", ")}`);
      let bad = 0;
      rows.forEach((row, i) => {
        if (i === 0) return;
        if (row.length === 1 && row[0] === "" && i === rows.length - 1) return;
        if (row.length !== width) {
          bad++;
          if (bad <= 20) r.problems.push(`row ${i + 1}: ${row.length} columns, header has ${width} — ${truncateLine(row.join(","), 100)}`);
        }
      });
      if (bad > 20) r.problems.push(`… +${bad - 20} more rows with the wrong column count`);
      r.checks.push(`csv-structure (${fmtInt(rows.length - 1)} rows × ${width} cols)`);
    }
  }

  if (ext === ".md" || ext === ".markdown" || ext === ".mdx") await checkLinks(text, file!, false, r);
  if (ext === ".html" || ext === ".htm") await checkLinks(text, file!, true, r);

  if (args.schema) {
    if (ext !== ".json" && ext !== ".yaml" && ext !== ".yml") throw teach("`schema` only applies to JSON/YAML files.", "Pass a .json or .yaml file, or drop `schema`.");
    if (!parsedOk) r.warnings.push("schema check skipped because the file did not parse");
    else await checkJsonSchema(data, args.schema, r);
  }
  return finishReport(file!, r, buf.length);
}

function finishReport(file: string, r: Report, rawBytes: number): LibResult {
  const lines: string[] = [];
  const name = path.basename(file);
  if (r.problems.length === 0) {
    lines.push(`PASS ${name} · checks: ${r.checks.join(", ")}`);
  } else {
    lines.push(`FAIL ${name} · ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"} · checks: ${r.checks.join(", ")}`);
    for (const p of r.problems) lines.push(`  ✗ ${p}`);
  }
  for (const w of r.warnings) lines.push(`  ⚠ ${w}`);
  if (r.problems.length) lines.push("fix the problems above, then run validate_file again");
  return { text: lines.join("\n"), rawBytes };
}
