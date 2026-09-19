// @author AVRG3
import { createReadStream, promises as fs } from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { boundText, fmtInt, resolveInputs, teach, truncateLine } from "@tinytools/shared";
import type { SummarizeLogArgs } from "../schemas.js";
import type { LibResult } from "./result.js";

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

interface TsMatch {
  ms: number;
  text: string;
}

/** Find a timestamp in the first ~80 chars of a line (ISO, `YYYY/MM/DD`, syslog, Apache CLF, epoch). */
export function parseTimestamp(line: string): TsMatch | null {
  const head = line.slice(0, 80);
  let m = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/.exec(head);
  if (m) {
    const ms = Date.parse(m[1]!.replace(" ", "T").replace(",", "."));
    if (!Number.isNaN(ms)) return { ms, text: m[1]! };
  }
  m = /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/.exec(head);
  if (m) {
    const ms = Date.parse(m[1]!.replace(/\//g, "-").replace(" ", "T"));
    if (!Number.isNaN(ms)) return { ms, text: m[1]! };
  }
  m = /\[(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/.exec(head);
  if (m) {
    const mon = MONTHS[m[2]!.toLowerCase()];
    if (mon !== undefined) return { ms: Date.UTC(+m[3]!, mon, +m[1]!, +m[4]!, +m[5]!, +m[6]!), text: m[0].slice(1) };
  }
  m = /^(?:<\d+>)?([A-Z][a-z]{2})\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2})/.exec(head);
  if (m) {
    const mon = MONTHS[m[1]!.toLowerCase()];
    if (mon !== undefined) return { ms: new Date(new Date().getFullYear(), mon, +m[2]!, +m[3]!, +m[4]!, +m[5]!).getTime(), text: m[0] };
  }
  m = /^\[?(\d{13})\b/.exec(head);
  if (m) return { ms: +m[1]!, text: m[1]! };
  m = /^\[?(\d{10})(?:\.\d+)?\b/.exec(head);
  if (m) return { ms: +m[1]! * 1000, text: m[1]! };
  return null;
}

const LEVEL_RE = /\b(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|FATAL|CRITICAL|CRIT|PANIC|SEVERE)\b/;
const ERRORISH = /\b(error|exception|traceback|fail(?:ed|ure|s)?|fatal|panic|crash(?:ed)?|timeout|timed out|refused|denied)\b|(?:status(?:\s*code)?[=: ]+|HTTP\/\d(?:\.\d)?"\s)5\d\d\b/i;
const WARNISH = /\bwarn(?:ing)?\b/i;
const KEY_SEP = " ␟ ";

export function normaliseLevel(l: string | undefined): string | null {
  if (!l) return null;
  const u = l.toUpperCase();
  if (u === "WARNING") return "WARN";
  if (u === "ERR") return "ERROR";
  if (u === "CRIT" || u === "SEVERE") return "CRITICAL";
  return u;
}

/** Drain-style template: mask the variable parts so repeated messages group together. */
export function templateOf(line: string, tsText: string | null): string {
  let s = tsText ? line.replace(tsText, "") : line;
  s = s
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/\b(?:https?|ftp):\/\/[^\s"'<>]+/g, "<url>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, "<ip>")
    .replace(/[A-Za-z]:\\[^\s"'<>]+/g, "<path>")
    .replace(/(?:^|(?<=\s|=|:|"|'|\())(?:\/[\w.@-]+){2,}\/?/g, "<path>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<hex>")
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{6,}\b/gi, "<hex>")
    .replace(/(?<![A-Za-z])[-+]?\d+(?:[.,]\d+)*(?!\d)/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, 200);
}

function parseSince(spec: string): number {
  const rel = /^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day|w)s?$/i.exec(spec.trim());
  if (rel) {
    const n = parseFloat(rel[1]!);
    const unit = rel[2]!.toLowerCase();
    const mult = unit.startsWith("s") ? 1000 : unit.startsWith("m") ? 60_000 : unit.startsWith("h") ? 3_600_000 : unit.startsWith("d") ? 86_400_000 : 604_800_000;
    return Date.now() - n * mult;
  }
  const abs = Date.parse(spec);
  if (!Number.isNaN(abs)) return abs;
  throw teach(`Bad \`since\` value "${spec}".`, "Use an ISO timestamp like '2026-09-18T10:00:00' or a relative span like '2h', '30m', '3d'.");
}

function fmtTs(ms: number, withDate: boolean): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return withDate ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${time}` : time;
}

function fmtSpan(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`;
  return `${Math.floor(ms / 86_400_000)}d ${Math.round((ms % 86_400_000) / 3_600_000)}h`;
}

interface Cluster {
  count: number;
  first: number | null;
  last: number | null;
  sample: string;
  level: string | null;
}

export async function summarizeLog(args: SummarizeLogArgs): Promise<LibResult> {
  const [file] = await resolveInputs(args.path);
  const rawBytes = (await fs.stat(file!)).size;
  const maxClusters = args.max_clusters ?? 15;
  const sinceMs = args.since ? parseSince(args.since) : null;

  let focusName = "";
  let focusFn: ((line: string, level: string | null) => boolean) | null = null;
  if (args.focus) {
    const f = args.focus.trim();
    if (/^errors?$/i.test(f)) {
      focusName = "errors";
      focusFn = (line, level) => level === "ERROR" || level === "FATAL" || level === "CRITICAL" || level === "PANIC" || ERRORISH.test(line);
    } else if (/^warn(ing)?s?$/i.test(f)) {
      focusName = "warnings";
      focusFn = (line, level) => level === "WARN" || WARNISH.test(line);
    } else {
      focusName = `/${f}/i`;
      let re: RegExp;
      try {
        re = new RegExp(f, "i");
      } catch {
        re = new RegExp(f.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        focusName = `"${f}"`;
      }
      focusFn = (line) => re.test(line);
    }
  }

  const clusters = new Map<string, Cluster>();
  const levels = new Map<string, number>();
  const stamps: number[] = [];
  const focusStamps: number[] = [];
  let total = 0;
  let considered = 0;
  let focused = 0;
  let withTs = 0;
  let overflow = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;
  const MAX_TEMPLATES = 20_000;

  const rl = readline.createInterface({ input: createReadStream(file!, { encoding: "utf8" }), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const rawLine of rl) {
    total++;
    const line = rawLine.length > 2000 ? rawLine.slice(0, 2000) : rawLine;
    if (!line.trim()) continue;
    const ts = parseTimestamp(line);
    if (ts) {
      withTs++;
      if (firstTs === null || ts.ms < firstTs) firstTs = ts.ms;
      if (lastTs === null || ts.ms > lastTs) lastTs = ts.ms;
      if (sinceMs !== null && ts.ms < sinceMs) continue;
    } else if (sinceMs !== null && withTs > 0) continue;
    considered++;
    const level = normaliseLevel(LEVEL_RE.exec(line)?.[1]);
    if (level) levels.set(level, (levels.get(level) ?? 0) + 1);
    const inFocus = focusFn ? focusFn(line, level) : true;
    if (ts) {
      stamps.push(ts.ms);
      if (inFocus && focusFn) focusStamps.push(ts.ms);
    }
    if (!inFocus) continue;
    focused++;
    const tpl = `${level ?? ""}${KEY_SEP}${templateOf(line, ts?.text ?? null)}`;
    let c = clusters.get(tpl);
    if (!c) {
      if (clusters.size >= MAX_TEMPLATES) {
        overflow++;
        continue;
      }
      c = { count: 0, first: null, last: null, sample: line, level };
      clusters.set(tpl, c);
    }
    c.count++;
    if (ts) {
      if (c.first === null || ts.ms < c.first) c.first = ts.ms;
      if (c.last === null || ts.ms > c.last) c.last = ts.ms;
    }
  }

  if (total === 0) throw teach(`${path.basename(file!)} is empty.`, "Nothing to summarise.");
  if (sinceMs !== null && considered === 0) {
    throw teach(
      `No lines at/after ${new Date(sinceMs).toISOString()} (since "${args.since}").${lastTs !== null ? ` The last timestamp in the file is ${new Date(lastTs).toISOString()}.` : " No timestamps were recognised in the file."}`,
      "Use an ISO `since` inside the file's time range, or drop `since`.",
    );
  }

  const lines: string[] = [];
  const sameDay = firstTs !== null && lastTs !== null && new Date(firstTs).toISOString().slice(0, 10) === new Date(lastTs).toISOString().slice(0, 10);
  const spanText = firstTs !== null && lastTs !== null ? `${fmtTs(firstTs, true)} → ${fmtTs(lastTs, !sameDay)} UTC (${fmtSpan(lastTs - firstTs)})` : "no timestamps recognised";
  const levelText = [...levels.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${fmtInt(v)}`)
    .join(" · ");
  lines.push(
    `${path.basename(file!)} · ${fmtInt(total)} lines${sinceMs !== null ? ` (${fmtInt(considered)} since ${args.since})` : ""}${focusFn ? ` · ${fmtInt(focused)} match focus ${focusName}` : ""} · ${spanText}${levelText ? ` · levels: ${levelText}` : ""}`,
  );

  if (stamps.length >= 2 && firstTs !== null && lastTs !== null && lastTs > firstTs) {
    const buckets = Math.min(12, Math.max(4, Math.round(stamps.length / 50)));
    const lo = sinceMs !== null ? Math.max(sinceMs, firstTs) : firstTs;
    const width = (lastTs - lo) / buckets || 1;
    const all = new Array<number>(buckets).fill(0);
    const foc = new Array<number>(buckets).fill(0);
    for (const s of stamps) all[Math.min(buckets - 1, Math.max(0, Math.floor((s - lo) / width)))]!++;
    for (const s of focusStamps) foc[Math.min(buckets - 1, Math.max(0, Math.floor((s - lo) / width)))]!++;
    const peak = Math.max(...all, 1);
    lines.push(`timeline (${buckets} buckets × ${fmtSpan(width)}${focusFn ? `, "focus" = lines matching ${focusName}` : ""}):`);
    for (let i = 0; i < buckets; i++) {
      const bar = "#".repeat(Math.max(all[i]! > 0 ? 1 : 0, Math.round((all[i]! / peak) * 20)));
      lines.push(`  ${fmtTs(lo + i * width, false)} ${bar.padEnd(20)} ${fmtInt(all[i]!)}${focusFn ? ` · focus ${fmtInt(foc[i]!)}` : ""}`);
    }
  }

  const ranked = [...clusters.entries()].sort((a, b) => b[1].count - a[1].count);
  lines.push(
    `top ${Math.min(maxClusters, ranked.length)} of ${fmtInt(ranked.length)} clusters (by count)${overflow ? ` · ${fmtInt(overflow)} lines fell outside the ${fmtInt(MAX_TEMPLATES)}-template cap` : ""}:`,
  );
  ranked.slice(0, maxClusters).forEach(([key, c], i) => {
    const tpl = key.slice(key.indexOf(KEY_SEP) + KEY_SEP.length);
    const when = c.first !== null && c.last !== null ? ` ${fmtTs(c.first, false)}→${fmtTs(c.last, false)}` : "";
    lines.push(`#${i + 1} ×${fmtInt(c.count)}${c.level ? ` ${c.level}` : ""}${when}  ${truncateLine(tpl, 160)}`);
    lines.push(`   e.g. ${truncateLine(c.sample, 200)}`);
  });
  if (ranked.length > maxClusters) lines.push(`+${fmtInt(ranked.length - maxClusters)} more clusters — raise max_clusters (cap 50) or add \`focus\``);
  if (!focusFn && (levels.get("ERROR") ?? 0) + (levels.get("FATAL") ?? 0) > 0) lines.push("next: summarize_log({ focus: 'errors' }) to cluster only the failures, then extract/grep the exact message");
  const bounded = boundText(lines.join("\n"), 16_000, "lower max_clusters");
  return { text: bounded.text, rawBytes };
}
