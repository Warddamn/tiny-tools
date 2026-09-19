import { byteLength, estimateTokens, fmtInt } from "./ledger.js";

/** Rule 9 — bound every response. Default ≤ 4,000 tokens ≈ 16 KB. */
export const DEFAULT_MAX_RESPONSE_BYTES = 16_000;

export interface BoundResult {
  text: string;
  truncated: boolean;
  totalBytes: number;
}

/** Cut `text` at the last newline before `maxBytes`, appending a note that says how to narrow. */
export function boundText(text: string, maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES, hint = "narrow the request"): BoundResult {
  const totalBytes = byteLength(text);
  if (totalBytes <= maxBytes) return { text, truncated: false, totalBytes };
  const buf = Buffer.from(text, "utf8").subarray(0, maxBytes);
  let cut = buf.toString("utf8");
  const nl = cut.lastIndexOf("\n");
  if (nl > maxBytes * 0.5) cut = cut.slice(0, nl);
  cut = cut.replace(/�+$/, "");
  const pct = ((byteLength(cut) / totalBytes) * 100).toFixed(0);
  const note = `\n… truncated at ~${fmtInt(estimateTokens(maxBytes))} tokens (${pct}% of ${fmtInt(estimateTokens(totalBytes))} shown) — ${hint}`;
  return { text: cut + note, truncated: true, totalBytes };
}

/** One-line clamp for samples/excerpts. */
export function truncateLine(s: string, max = 200): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

/** "showing 8 of 143 matches" / "143 matches" */
export function shownOf(shown: number, total: number, unit: string): string {
  const u = total === 1 ? unit : `${unit}s`;
  return shown < total ? `showing ${shown} of ${fmtInt(total)} ${u}` : `${fmtInt(total)} ${u}`;
}
