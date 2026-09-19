// @author AVRG3
import * as path from "node:path";
import {
  type ExtractedText,
  type Location,
  type SheetMeta,
  boundText,
  colToIndex,
  detectKind,
  extractText,
  fmtInt,
  formatLocation,
  parseCsv,
  resolveInputs,
  splitRef,
  truncateLine,
} from "@tiny_tools_pw/shared";
import type { DiffFilesArgs } from "../schemas.js";
import { type DiffOp, diffLines, hunksOf } from "./diff.js";
import type { LibResult } from "./result.js";

const TABULAR = new Set(["csv", "xlsx"]);
const ROW_SEP = " ␟ ";

async function tableRows(file: string): Promise<{ rows: string[][]; label: string; bytes: number }> {
  const ex = await extractText(file);
  if (ex.kind === "xlsx") {
    const sheets = (ex.meta["sheets"] as SheetMeta[]) ?? [];
    const first = sheets[0];
    const cols = Math.max(first?.cols ?? 1, 1);
    const rows: string[][] = [];
    for (const b of ex.blocks) {
      if (b.loc.sheet !== first?.name) continue;
      const row = new Array<string>(cols).fill("");
      for (const c of b.cells ?? []) row[colToIndex(splitRef(c.ref).col) - 1] = c.value;
      rows.push(row);
    }
    return { rows, label: `${path.basename(file)} (sheet ${first?.name ?? "?"})`, bytes: ex.textBytes };
  }
  return { rows: parseCsv(ex.blocks.map((b) => b.text).join("\n")), label: path.basename(file), bytes: ex.textBytes };
}

function diffTables(A: { rows: string[][]; label: string }, B: { rows: string[][]; label: string }, maxSamples: number): string[] {
  const out: string[] = [];
  const ha = A.rows[0] ?? [];
  const hb = B.rows[0] ?? [];
  const sameHeader = ha.join(ROW_SEP) === hb.join(ROW_SEP);
  const addedCols = hb.filter((c) => !ha.includes(c));
  const removedCols = ha.filter((c) => !hb.includes(c));
  const da = A.rows.slice(1);
  const db = B.rows.slice(1);
  const key = (r: string[]): string => r.join(ROW_SEP);

  const uniqueFirst = (rows: string[][]): boolean => {
    const s = new Set<string>();
    for (const r of rows) {
      const k = r[0] ?? "";
      if (!k || s.has(k)) return false;
      s.add(k);
    }
    return rows.length > 0;
  };
  const keyed = sameHeader && uniqueFirst(da) && uniqueFirst(db);
  const added: Array<{ row: string[]; n: number }> = [];
  const removed: Array<{ row: string[]; n: number }> = [];
  const changed: Array<{ a: string[]; b: string[]; na: number; nb: number }> = [];
  if (keyed) {
    const mapA = new Map<string, { row: string[]; n: number }>();
    const mapB = new Map<string, { row: string[]; n: number }>();
    da.forEach((r, i) => mapA.set(r[0]!, { row: r, n: i + 2 }));
    db.forEach((r, i) => mapB.set(r[0]!, { row: r, n: i + 2 }));
    for (const [k, va] of mapA) {
      const vb = mapB.get(k);
      if (!vb) removed.push(va);
      else if (key(va.row) !== key(vb.row)) changed.push({ a: va.row, b: vb.row, na: va.n, nb: vb.n });
    }
    for (const [k, vb] of mapB) if (!mapA.has(k)) added.push(vb);
  } else {
    const countA = new Map<string, number[]>();
    da.forEach((r, i) => {
      const k = key(r);
      const list = countA.get(k);
      if (list) list.push(i + 2);
      else countA.set(k, [i + 2]);
    });
    const countB = new Map<string, number[]>();
    db.forEach((r, i) => {
      const k = key(r);
      const list = countB.get(k);
      if (list) list.push(i + 2);
      else countB.set(k, [i + 2]);
    });
    for (const [k, ns] of countA) {
      const nb = countB.get(k)?.length ?? 0;
      for (let x = nb; x < ns.length; x++) removed.push({ row: k.split(ROW_SEP), n: ns[x]! });
    }
    for (const [k, ns] of countB) {
      const na = countA.get(k)?.length ?? 0;
      for (let x = na; x < ns.length; x++) added.push({ row: k.split(ROW_SEP), n: ns[x]! });
    }
  }
  const unchanged = Math.max(0, da.length - removed.length - changed.length);
  out.push(
    `${A.label} → ${B.label} · ${fmtInt(da.length)} → ${fmtInt(db.length)} data rows · +${fmtInt(added.length)} added · −${fmtInt(removed.length)} removed · ~${fmtInt(changed.length)} changed · ${fmtInt(unchanged)} unchanged${keyed ? " (matched on first column)" : ""}`,
  );
  if (!sameHeader) {
    const parts: string[] = [];
    if (removedCols.length) parts.push(`removed ${removedCols.join(", ")}`);
    if (addedCols.length) parts.push(`added ${addedCols.join(", ")}`);
    out.push(`columns: ${parts.length ? parts.join(" · ") : "reordered/renamed"}`);
  }
  const show = (label: string, list: Array<{ row: string[]; n: number }>, sign: string): void => {
    if (!list.length) return;
    out.push(`${label} (${fmtInt(list.length)}):`);
    for (const r of list.slice(0, maxSamples)) out.push(`  ${sign} row ${r.n}: ${truncateLine(r.row.join(" | "), 160)}`);
    if (list.length > maxSamples) out.push(`  … +${fmtInt(list.length - maxSamples)} more`);
  };
  show("added", added, "+");
  show("removed", removed, "−");
  if (changed.length) {
    out.push(`changed (${fmtInt(changed.length)}):`);
    for (const c of changed.slice(0, maxSamples)) {
      const cols = ha.map((h, i) => (c.a[i] !== c.b[i] ? `${h}: ${truncateLine(c.a[i] ?? "", 40)} → ${truncateLine(c.b[i] ?? "", 40)}` : null)).filter(Boolean);
      out.push(`  ~ ${c.a[0]} (rows ${c.na}→${c.nb}): ${cols.join("; ")}`);
    }
    if (changed.length > maxSamples) out.push(`  … +${fmtInt(changed.length - maxSamples)} more`);
  }
  if (!added.length && !removed.length && !changed.length && sameHeader) out.push("No row differences.");
  return out;
}

function locLabel(ex: ExtractedText, idx: number): string {
  const b = ex.blocks[Math.min(idx, ex.blocks.length - 1)];
  if (!b) return "end";
  const loc: Location = b.loc;
  if (loc.page !== undefined) return `page ${loc.page}`;
  if (loc.slide !== undefined) return `slide ${loc.slide}`;
  if (loc.sheet !== undefined) return `${loc.sheet} row ${loc.row}`;
  return formatLocation(loc, { withHeading: true });
}

function rangeLabel(ex: ExtractedText, start: number, end: number): string {
  if (start < 0) return "—";
  const a = ex.blocks[start];
  const b = ex.blocks[Math.min(end, ex.blocks.length - 1)];
  if (!a || !b) return "end";
  const heading = a.loc.heading?.length ? ` (${a.loc.heading.join(" > ")})` : "";
  if (a.loc.page === undefined && a.loc.line !== undefined && b.loc.line !== undefined && a.loc.line !== b.loc.line) return `lines ${a.loc.line}–${b.loc.line}${heading}`;
  if (a.loc.para !== undefined && b.loc.para !== undefined && a.loc.para !== b.loc.para) return `¶${a.loc.para}–${b.loc.para}${heading}`;
  if (a.loc.page !== undefined && b.loc.page !== undefined && a.loc.page !== b.loc.page) return `pages ${a.loc.page}–${b.loc.page}`;
  return locLabel(ex, start);
}

export async function diffFiles(args: DiffFilesArgs): Promise<LibResult> {
  const [a] = await resolveInputs(args.a);
  const [b] = await resolveInputs(args.b);
  const mode = args.mode ?? "summary";
  const maxHunks = args.max_hunks ?? 20;
  const ka = detectKind(a!);
  const kb = detectKind(b!);

  if (mode === "summary" && TABULAR.has(ka) && TABULAR.has(kb)) {
    const A = await tableRows(a!);
    const B = await tableRows(b!);
    const text = diffTables(A, B, Math.min(maxHunks, 10)).join("\n");
    return { text: boundText(text, 16_000, "lower max_hunks").text, rawBytes: A.bytes + B.bytes };
  }

  const ea = await extractText(a!);
  const eb = await extractText(b!);
  const la = ea.blocks.map((x) => x.text);
  const lb = eb.blocks.map((x) => x.text);
  const rawBytes = ea.textBytes + eb.textBytes;
  const ops = diffLines(la, lb);
  const hunks = hunksOf(ops, mode === "unified" ? 6 : 3);
  const added = ops.filter((o) => o.type === "add").length;
  const removed = ops.filter((o) => o.type === "del").length;
  const equal = ops.length - added - removed;
  const unit = ea.kind === "docx" ? "paragraphs" : ea.kind === "xlsx" ? "rows" : "lines";
  const na = path.basename(a!);
  const nb = path.basename(b!);

  if (hunks.length === 0) {
    return { text: `No differences: ${na} and ${nb} have identical text (${fmtInt(la.length)} ${unit}).`, rawBytes };
  }

  const lines: string[] = [];
  if (mode === "summary") {
    lines.push(`${na} → ${nb} · ${fmtInt(hunks.length)} changed section${hunks.length === 1 ? "" : "s"} · +${fmtInt(added)} −${fmtInt(removed)} ${unit} · ${fmtInt(equal)} unchanged`);
    hunks.slice(0, maxHunks).forEach((h, i) => {
      const where = h.bStart >= 0 ? rangeLabel(eb, h.bStart, h.bEnd) : `after ${locLabel(ea, h.aStart)}`;
      const wasLabel = h.aStart >= 0 ? rangeLabel(ea, h.aStart, h.aEnd) : "";
      const whereA = h.aStart >= 0 && h.bStart >= 0 && wasLabel !== where ? ` (was ${wasLabel})` : "";
      lines.push(`#${i + 1} ${where}${whereA} · +${h.added} −${h.removed}`);
      const slice = ops.slice(h.from, h.to + 1);
      const sampleDel = slice.find((o): o is Extract<DiffOp, { type: "del" }> => o.type === "del");
      const sampleAdd = slice.find((o): o is Extract<DiffOp, { type: "add" }> => o.type === "add");
      if (sampleDel && la[sampleDel.a]!.trim()) lines.push(`   − ${truncateLine(la[sampleDel.a]!, 160)}`);
      if (sampleAdd && lb[sampleAdd.b]!.trim()) lines.push(`   + ${truncateLine(lb[sampleAdd.b]!, 160)}`);
    });
    if (hunks.length > maxHunks) lines.push(`… +${fmtInt(hunks.length - maxHunks)} more sections — raise max_hunks (cap 100) or use mode 'unified' on a narrower pair`);
    lines.push("full text of any section: read_section on either file at the location shown; mode: 'unified' for the line-level diff");
  } else {
    lines.push(`--- ${a}`);
    lines.push(`+++ ${b}`);
    const ctx = 3;
    hunks.slice(0, maxHunks).forEach((h) => {
      const from = Math.max(0, h.from - ctx);
      const to = Math.min(ops.length - 1, h.to + ctx);
      let aS = -1;
      let bS = -1;
      let aN = 0;
      let bN = 0;
      for (let x = from; x <= to; x++) {
        const op = ops[x]!;
        if (op.type !== "add") {
          if (aS === -1) aS = op.a;
          aN++;
        }
        if (op.type !== "del") {
          if (bS === -1) bS = op.b;
          bN++;
        }
      }
      lines.push(`@@ -${aS + 1},${aN} +${bS + 1},${bN} @@`);
      for (let x = from; x <= to; x++) {
        const op = ops[x]!;
        if (op.type === "eq") lines.push(` ${la[op.a]}`);
        else if (op.type === "del") lines.push(`-${la[op.a]}`);
        else lines.push(`+${lb[op.b]}`);
      }
    });
    if (hunks.length > maxHunks) lines.push(`… +${fmtInt(hunks.length - maxHunks)} more hunks — raise max_hunks (cap 100)`);
  }
  const bounded = boundText(lines.join("\n"), 16_000, "use mode 'summary' or lower max_hunks");
  return { text: bounded.text, rawBytes };
}
