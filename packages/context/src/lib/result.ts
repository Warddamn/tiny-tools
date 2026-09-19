import { ledger } from "@tinytools/shared";

/** Every lib function returns text + the bytes an agent would otherwise have read (for the rule-11 ledger). */
export interface LibResult {
  text: string;
  rawBytes: number;
}

/** Response text + ledger line (rule 11). */
export function finish(r: LibResult, elapsedMs: number): string {
  return `${r.text.replace(/\s+$/, "")}\n${ledger({ returnedText: r.text, rawBytes: r.rawBytes, elapsedMs })}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Parse "3-5", "7", "1,4,9-11" into a sorted unique list of ints (1-based). Returns null when unparsable. */
export function parseRange(spec: string | number, max = 1_000_000): number[] | null {
  if (typeof spec === "number") return Number.isInteger(spec) && spec >= 1 ? [spec] : null;
  const out = new Set<number>();
  for (const part of String(spec).split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(p);
    if (m) {
      const a = parseInt(m[1]!, 10);
      const b = parseInt(m[2]!, 10);
      if (a < 1 || b < a) return null;
      for (let i = a; i <= Math.min(b, a + max); i++) out.add(i);
    } else if (/^\d+$/.test(p)) {
      const n = parseInt(p, 10);
      if (n < 1) return null;
      out.add(n);
    } else return null;
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

/** "3–5" from a sorted list, or "3, 5, 9" when not contiguous. */
export function describeRange(nums: number[]): string {
  if (nums.length === 0) return "";
  if (nums.length === 1) return String(nums[0]);
  const contiguous = nums[nums.length - 1]! - nums[0]! === nums.length - 1;
  return contiguous ? `${nums[0]}–${nums[nums.length - 1]}` : nums.slice(0, 6).join(", ") + (nums.length > 6 ? ", …" : "");
}
