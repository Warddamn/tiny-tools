import { describe, expect, it } from "vitest";
import { estimateTokens, filesLine, formatDuration, ledger } from "../src/index.js";

describe("ledger", () => {
  it("estimateTokens = bytes/4 rounded up", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(16_000)).toBe(4000);
  });

  it("formats the rule-11 line", () => {
    expect(ledger({ returnedText: "x".repeat(856), rawBytes: 192_800, elapsedMs: 400 })).toBe(
      "Returned ~214 tokens · raw ≈ 48,200 tokens · 99.6% saved · 0.4s",
    );
  });

  it("says when there is no saving", () => {
    expect(ledger({ returnedText: "x".repeat(400), rawBytes: 100, elapsedMs: 10 })).toMatch(/0\.0% saved · 10ms \(no saving here/);
  });

  it("filesLine + durations", () => {
    expect(filesLine(3, 2100)).toBe("files: 3 · 2.1s");
    expect(formatDuration(62_000)).toBe("1m 02s");
    expect(formatDuration(59_940)).toBe("59.9s");
    expect(formatDuration(42)).toBe("42ms");
    expect(formatDuration(100)).toBe("0.1s");
  });
});
