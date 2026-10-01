// @author AVRG3
import { teach } from "@tiny_tools_pw/shared";

/** Reject ambiguous objects and numbers that native JSON.parse would silently round. */
export function parseExactJson(text: string): unknown {
  let i = 0;
  const fail = (why: string): never => { throw teach(`Invalid comparison JSON at character ${i + 1}: ${why}.`, "Use valid JSON with unique object keys; quote high-precision numbers and IDs as strings. Maximum nesting is 64."); };
  const ws = (): void => { while (i < text.length && /[\t\r\n ]/.test(text[i]!)) i++; };
  const string = (): string => {
    const start = i++;
    while (i < text.length) {
      const c = text[i++]!;
      if (c === "\\") i++;
      else if (c === '"') {
        try { return JSON.parse(text.slice(start, i)) as string; } catch { fail("bad string"); }
      }
    }
    return fail("unclosed string");
  };
  const normalized = (raw: string): string => {
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw)!;
    const fraction = m[3] ?? "";
    let digits = (m[2]! + fraction).replace(/^0+/, "");
    if (!digits) return "0";
    let power = BigInt(m[4] ?? "0") - BigInt(fraction.length);
    const trimmed = digits.replace(/0+$/, "");
    power += BigInt(digits.length - trimmed.length); digits = trimmed;
    return `${m[1]}${digits}e${power}`;
  };
  const value = (depth: number): void => {
    if (depth > 64) fail("nesting exceeds 64");
    ws(); const c = text[i];
    if (c === '"') { string(); return; }
    if (c === "{" || c === "[") {
      i++; ws(); const close = c === "{" ? "}" : "]"; const keys = new Set<string>();
      if (text[i] === close) { i++; return; }
      while (i < text.length) {
        if (c === "{") {
          ws(); if (text[i] !== '"') fail("expected object key");
          const key = string();
          if (keys.has(key)) fail("duplicate object key");
          keys.add(key); ws(); if (text[i++] !== ":") fail("expected colon");
        }
        value(depth + 1); ws();
        if (text[i] === close) { i++; return; }
        if (text[i++] !== ",") fail("expected comma");
      }
      fail("unclosed container");
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, i)) { i += literal.length; return; }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (!match) fail("expected value");
    const raw = match![0]; i += raw.length;
    if (raw.length > 1024 || !Number.isFinite(Number(raw)) || normalized(raw) !== normalized(String(Number(raw)))) fail("number would lose precision");
  };
  value(0); ws(); if (i !== text.length) fail("unexpected trailing text");
  // JSON serializes both signed zeros as 0; keep comparison and exported values consistent.
  return JSON.parse(text, (_key, value: unknown) => Object.is(value, -0) ? 0 : value) as unknown;
}
