// @author AVRG3
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import {
  boundText,
  detect,
  detectKind,
  extractText,
  fmtInt,
  formatError,
  formatLocation,
  installHint,
  resolveInputs,
  teach,
  truncateLine,
} from "@tinytools/shared";
import type { ExtractArgs } from "../schemas.js";
import type { LibResult } from "./result.js";

const execFileP = promisify(execFile);

export const KIND_PATTERNS: Record<NonNullable<ExtractArgs["kind"]>, RegExp> = {
  emails: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  urls: /\b(?:https?|ftp):\/\/[^\s<>"'`)\]]+/g,
  dates:
    /\b(?:\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4}|\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,? \d{4})\b/g,
  numbers: /(?<![\w.])[-+]?[$€£]?\d[\d,]*(?:\.\d+)?%?(?![\w.])/g,
};

interface Hit {
  value: string;
  file: string;
  where: string;
}

/** Split a jq filter on top-level `|` (not inside quotes/brackets). */
function splitPipes(filter: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  let quote: string | null = null;
  for (const ch of filter) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === "[" || ch === "(" || ch === "{") depth++;
    if (ch === "]" || ch === ")" || ch === "}") depth--;
    if (ch === "|" && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const UNSUPPORTED = (stage: string) =>
  teach(
    `jq filter '${stage}' is not supported by the built-in fallback (system jq not found).`,
    `${installHint("jq")} Or use the supported subset: paths like '.items[].name', '.a["b"]', '.[0]', plus 'keys', 'length', 'values', '..' and '|' chains.`,
  );

/** Minimal jq: paths, [], [n], keys, length, values, .. — enough for "get me X out of this JSON". */
export function evalJqSubset(filter: string, data: unknown): unknown[] {
  let values: unknown[] = [data];
  for (const stage of splitPipes(filter)) {
    if (stage === ".") continue;
    if (stage === "keys") {
      values = values.map((v) => (Array.isArray(v) ? v.map((_, i) => i) : v && typeof v === "object" ? Object.keys(v).sort() : null));
      continue;
    }
    if (stage === "length") {
      values = values.map((v) => (Array.isArray(v) || typeof v === "string" ? v.length : v && typeof v === "object" ? Object.keys(v).length : v === null ? 0 : Math.abs(Number(v))));
      continue;
    }
    if (stage === "values" || stage === ".[]?") {
      values = values.flatMap((v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []));
      continue;
    }
    if (stage === "..") {
      const all: unknown[] = [];
      const walk = (v: unknown): void => {
        all.push(v);
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") Object.values(v).forEach(walk);
      };
      values.forEach(walk);
      values = all;
      continue;
    }
    if (!/^\.(?:[\w-]+|\[\d+\]|\["[^"]+"\]|\[\]|\.[\w-]+|\[\]\.[\w-]+)*\??$/.test(stage.replace(/\]\./g, "]."))) throw UNSUPPORTED(stage);
    const segs: Array<{ key?: string; index?: number; each?: boolean }> = [];
    const re = /\.([\w-]+)|\["([^"]+)"\]|\[(\d+)\]|\[\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stage))) {
      if (m[1] !== undefined || m[2] !== undefined) segs.push({ key: m[1] ?? m[2] });
      else if (m[3] !== undefined) segs.push({ index: parseInt(m[3], 10) });
      else segs.push({ each: true });
    }
    for (const seg of segs) {
      values = values.flatMap((v) => {
        if (seg.each) return Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];
        if (seg.index !== undefined) return Array.isArray(v) ? [v[seg.index] ?? null] : [null];
        if (v && typeof v === "object" && !Array.isArray(v)) return [(v as Record<string, unknown>)[seg.key!] ?? null];
        return [null];
      });
    }
  }
  return values;
}

async function jqFile(file: string, filter: string): Promise<{ values: string[]; engine: string }> {
  const jq = await detect("jq");
  if (jq) {
    try {
      const { stdout } = await execFileP(jq, ["-c", filter, file], { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 });
      return { values: stdout.split("\n").filter((l) => l.length > 0), engine: "jq" };
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      const msg = (err.stderr ?? err.message ?? "").trim().split("\n").slice(0, 3).join(" ");
      throw teach(`jq failed on ${path.basename(file)}: ${msg}`, "Fix the filter (jq syntax) or check the file is valid JSON with validate_file.");
    }
  }
  let data: unknown;
  try {
    data = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    throw teach(`${path.basename(file)} is not valid JSON: ${(e as Error).message}`, "Run validate_file for the error location.");
  }
  return { values: evalJqSubset(filter, data).map((v) => JSON.stringify(v)), engine: "built-in subset" };
}

export async function extract(args: ExtractArgs): Promise<LibResult> {
  const patterns = [...(args.path ? [args.path] : []), ...(args.paths ?? [])];
  if (patterns.length === 0) throw teach("No `path` or `paths` given.", "Pass a file, a glob like '/abs/docs/*.pdf', or a list of them.");
  const modes = [args.pattern ? "pattern" : null, args.jq ? "jq" : null, args.kind ? "kind" : null].filter(Boolean);
  if (modes.length !== 1) throw teach(`Give exactly one of pattern | jq | kind (got ${modes.length ? modes.join(" + ") : "none"}).`, "Example: { kind: 'emails' } or { pattern: 'Invoice #(\\\\d+)' } or { jq: '.items[].name' }.");
  const files = await resolveInputs(patterns);
  const maxMatches = args.max_matches ?? 100;
  const dedupe = args.dedupe ?? true;

  let regex: RegExp | null = null;
  if (args.pattern) {
    try {
      regex = new RegExp(args.pattern, args.ignore_case ? "gi" : "g");
    } catch (e) {
      throw teach(`Invalid regular expression '${args.pattern}': ${(e as Error).message}`, "Escape special characters (e.g. '\\\\.' for a literal dot).");
    }
  } else if (args.kind) regex = KIND_PATTERNS[args.kind];

  const hits: Hit[] = [];
  const perFile = new Map<string, number>();
  const skipped: string[] = [];
  let rawBytes = 0;
  let engine = "";
  let totalRaw = 0;
  const hardCap = 50_000;

  for (const f of files) {
    const base = path.basename(f);
    try {
      if (args.jq) {
        if (detectKind(f) !== "json") {
          skipped.push(`${base} (jq needs a .json file)`);
          continue;
        }
        rawBytes += (await fs.stat(f)).size;
        const r = await jqFile(f, args.jq);
        engine = r.engine;
        perFile.set(base, r.values.length);
        totalRaw += r.values.length;
        r.values.forEach((v, i) => {
          if (hits.length < hardCap) hits.push({ value: v, file: base, where: `#${i + 1}` });
        });
        continue;
      }
      const ex = await extractText(f);
      rawBytes += ex.textBytes;
      let n = 0;
      for (const b of ex.blocks) {
        regex!.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex!.exec(b.text))) {
          if (m[0] === "") {
            regex!.lastIndex++;
            continue;
          }
          n++;
          totalRaw++;
          if (hits.length < hardCap) hits.push({ value: m[1] ?? m[0], file: base, where: formatLocation(b.loc) });
        }
      }
      perFile.set(base, n);
    } catch (e) {
      skipped.push(`${base} (${truncateLine(formatError(e), 140)})`);
    }
  }
  if (perFile.size === 0) throw teach(`None of the ${files.length} input(s) could be processed:\n  - ${skipped.join("\n  - ")}`, "Supported: txt/md/code/log/json/csv/pdf/docx/pptx/xlsx (jq: .json only).");

  const what = args.jq ? `jq '${args.jq}'` : args.kind ? `kind=${args.kind}` : `/${args.pattern}/${args.ignore_case ? "i" : ""}`;
  const lines: string[] = [];
  const multi = perFile.size > 1;
  const locs = (list: Hit[]): string => {
    const shown = list.slice(0, 3).map((h) => (multi ? `${h.file}: ${h.where}` : h.where));
    return shown.join(", ") + (list.length > 3 ? ` (+${list.length - 3} more)` : "");
  };

  if (dedupe) {
    const groups = new Map<string, Hit[]>();
    for (const h of hits) {
      const g = groups.get(h.value);
      if (g) g.push(h);
      else groups.set(h.value, [h]);
    }
    const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    lines.push(`${fmtInt(totalRaw)} match${totalRaw === 1 ? "" : "es"} (${fmtInt(groups.size)} unique) for ${what} in ${perFile.size} file${perFile.size === 1 ? "" : "s"}${engine ? ` · engine: ${engine}` : ""}`);
    for (const [value, list] of ordered.slice(0, maxMatches)) lines.push(`  ${truncateLine(value, 200)}${list.length > 1 ? ` ×${list.length}` : ""} — ${locs(list)}`);
    if (ordered.length > maxMatches) lines.push(`showing ${maxMatches} of ${fmtInt(ordered.length)} unique values — raise max_matches (cap 500) or narrow the pattern`);
  } else {
    lines.push(`${fmtInt(totalRaw)} match${totalRaw === 1 ? "" : "es"} for ${what} in ${perFile.size} file${perFile.size === 1 ? "" : "s"}${engine ? ` · engine: ${engine}` : ""}`);
    for (const h of hits.slice(0, maxMatches)) lines.push(`  ${truncateLine(h.value, 200)} — ${multi ? `${h.file}: ` : ""}${h.where}`);
    if (hits.length > maxMatches) lines.push(`showing ${maxMatches} of ${fmtInt(totalRaw)} — raise max_matches (cap 500) or narrow the pattern`);
  }
  if (totalRaw === 0) lines.push("  (nothing matched — check the pattern, or try query_file for fuzzy search)");
  if (multi) lines.push(`per file: ${[...perFile.entries()].map(([f, n]) => `${f} ${n}`).join(" · ")}`);
  if (skipped.length) lines.push(`skipped: ${skipped.join("; ")}`);
  const bounded = boundText(lines.join("\n"), 16_000, "lower max_matches or narrow the pattern");
  return { text: bounded.text, rawBytes };
}
