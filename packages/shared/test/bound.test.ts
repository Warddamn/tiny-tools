// @author AVRG3
import { describe, expect, it } from "vitest";
import { boundText, shownOf, truncateLine } from "../src/index.js";

describe("bound", () => {
  it("passes small text through", () => {
    expect(boundText("hello", 100)).toEqual({ text: "hello", truncated: false, totalBytes: 5 });
  });

  it("truncates at a newline and says how to narrow", () => {
    const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const r = boundText(text, 400, "use max_results to narrow");
    expect(r.truncated).toBe(true);
    expect(Buffer.byteLength(r.text.split("\n… truncated")[0]!)).toBeLessThanOrEqual(400);
    expect(r.text).toMatch(/… truncated at ~100 tokens \(\d+% of \d+ shown\) — use max_results to narrow$/);
  });

  it("truncateLine / shownOf", () => {
    expect(truncateLine("  a   b \n c ", 4)).toBe("a b…");
    expect(truncateLine("  a   b \n c ", 5)).toBe("a b c");
    expect(shownOf(8, 143, "match")).toBe("showing 8 of 143 matches");
    expect(shownOf(1, 1, "match")).toBe("1 match");
  });
});
