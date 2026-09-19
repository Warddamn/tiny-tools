import { describe, expect, it } from "vitest";
import { TeachError, formatError, teach, toolError } from "../src/index.js";

describe("teach-errors", () => {
  it("joins message and next step", () => {
    const e = teach("Input not found: /tmp/photo.jpg", "accepts absolute paths and globs like './shots/*.png'");
    expect(e).toBeInstanceOf(TeachError);
    expect(e.message).toBe("Input not found: /tmp/photo.jpg — accepts absolute paths and globs like './shots/*.png'");
    expect(e.nextStep).toMatch(/globs/);
  });

  it("formatError maps node error codes to a next step", () => {
    const err = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT", path: "/tmp/x.txt" });
    expect(formatError(err)).toBe(
      "ENOENT: /tmp/x.txt — The path does not exist. Accepts absolute paths, '~' paths, paths relative to the current directory, and globs like './shots/*.png'.",
    );
    expect(formatError(new TypeError("bad"))).toBe("TypeError: bad");
    expect(formatError("plain")).toBe("plain");
  });

  it("toolError has the MCP error shape", () => {
    expect(toolError(teach("boom", "fix it"))).toEqual({ isError: true, content: [{ type: "text", text: "boom — fix it" }] });
  });
});
