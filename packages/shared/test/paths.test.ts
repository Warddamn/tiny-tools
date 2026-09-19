// @author AVRG3
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { TeachError, expandGlob, expandHome, globToRegExp, isGlob, resolveInputs, toAbsolute } from "../src/index.js";
import { FIX, fx } from "./helpers.js";

describe("paths", () => {
  it("expands ~", () => {
    expect(expandHome("~/x")).toBe(path.join(os.homedir(), "x"));
    expect(expandHome("~")).toBe(os.homedir());
    expect(expandHome("/abs")).toBe("/abs");
  });

  it("toAbsolute resolves relative paths against cwd", () => {
    expect(toAbsolute("a/b", "/tmp")).toBe(path.resolve("/tmp/a/b"));
    expect(toAbsolute(" ~/z ")).toBe(path.join(os.homedir(), "z"));
  });

  it("isGlob", () => {
    expect(isGlob("./shots/*.png")).toBe(true);
    expect(isGlob("/plain/path.txt")).toBe(false);
  });

  it("globToRegExp supports * ** ? {a,b} [abc]", () => {
    const re = globToRegExp("**/*.{md,txt}");
    expect(re.test("a/b/c.md")).toBe(true);
    expect(re.test("c.txt")).toBe(true);
    expect(re.test("c.pdf")).toBe(false);
    expect(globToRegExp("sample.?s").test("sample.ts")).toBe(true);
    expect(globToRegExp("*.md").test("a/b.md")).toBe(false);
    expect(globToRegExp("[st]ample.ts").test("sample.ts")).toBe(true);
    expect(globToRegExp("src/**").test("src/a/b/c.ts")).toBe(true);
  });

  it("expandGlob returns sorted absolute matches", async () => {
    const r = await expandGlob(path.join(FIX, "*.md"));
    expect(r.some((f) => f.endsWith("sample.md"))).toBe(true);
    expect(r.every((f) => path.isAbsolute(f))).toBe(true);
    const deep = await expandGlob(path.join(FIX, "..", "**", "sample.ts"));
    expect(deep.some((f) => f.endsWith(path.join("fixtures", "sample.ts")))).toBe(true);
  });

  it("resolveInputs lists every bad input in one teach-error", async () => {
    const err = await resolveInputs([fx("nope.txt"), fx("*.zzz"), FIX]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeachError);
    const msg = (err as Error).message;
    expect(msg).toMatch(/nope\.txt \(not found\)/);
    expect(msg).toMatch(/\*\.zzz \(glob matched nothing\)/);
    expect(msg).toMatch(/is a directory/);
    expect(msg).toMatch(/globs like/);
  });

  it("resolveInputs dedupes, returns absolute paths", async () => {
    const r = await resolveInputs([fx("sample.md"), fx("sample.md"), path.join(FIX, "*.md")]);
    expect(r.filter((f) => f.endsWith("sample.md")).length).toBe(1);
    expect(r.every((f) => path.isAbsolute(f))).toBe(true);
  });

  it("resolveInputs allows directories when asked", async () => {
    const r = await resolveInputs(FIX, { allowDirs: true });
    expect(r).toEqual([FIX]);
  });

  it("resolveInputs rejects empty input", async () => {
    await expect(resolveInputs([])).rejects.toBeInstanceOf(TeachError);
    await expect(resolveInputs("  ")).rejects.toThrow(/No input given/);
  });

  it("resolveInputs caps the number of matches", async () => {
    await expect(resolveInputs(path.join(FIX, "*"), { max: 2 })).rejects.toThrow(/cap 2/);
  });
});
