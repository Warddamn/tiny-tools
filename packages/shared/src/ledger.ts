/**
 * Rule 11 — report the savings. tokens ≈ bytes/4.
 */
export function estimateTokens(bytes: number): number {
  return Math.max(0, Math.ceil(bytes / 4));
}

export function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export interface LedgerInput {
  /** The response text (without the ledger line itself). */
  returnedText: string;
  /** Bytes the agent would otherwise have had to read. */
  rawBytes: number;
  elapsedMs: number;
}

/** `Returned ~214 tokens · raw ≈ 48,200 tokens · 99.6% saved · 0.4s` */
export function ledger({ returnedText, rawBytes, elapsedMs }: LedgerInput): string {
  const returned = estimateTokens(byteLength(returnedText));
  const raw = estimateTokens(rawBytes);
  const savedPct = raw > 0 ? Math.max(0, (1 - returned / raw) * 100) : 0;
  let line = `Returned ~${fmtInt(returned)} tokens · raw ≈ ${fmtInt(raw)} tokens · ${savedPct.toFixed(1)}% saved · ${formatDuration(elapsedMs)}`;
  if (raw > 0 && returned >= raw) line += " (no saving here — reading the file directly is as cheap)";
  return line;
}

/** `files: N · 2.1s` — for tools whose alternative is not "the agent reads content". */
export function filesLine(count: number, elapsedMs: number): string {
  return `files: ${count} · ${formatDuration(elapsedMs)}`;
}
