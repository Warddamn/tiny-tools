import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, toCsvLine } from "../src/index.js";

describe("csv", () => {
  it("parses quotes, escaped quotes, CRLF", () => {
    const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n1,2\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", "2"],
    ]);
  });

  it("detects tab / semicolon delimiters", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("toCsvLine quotes when needed", () => {
    expect(toCsvLine(["a", 'b "c"', "d,e", null, 3])).toBe('a,"b ""c""","d,e",,3');
  });
});
