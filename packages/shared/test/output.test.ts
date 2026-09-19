import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { explicitOutputPath, outputPath, renamedNote } from "../src/index.js";

let tmp: string;
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-out-"));
  await fs.writeFile(path.join(tmp, "photo.jpg"), "x");
});
afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("outputPath", () => {
  it("suffix + new extension next to the input", async () => {
    const r = await outputPath(path.join(tmp, "photo.jpg"), { suffix: "-resized", ext: "webp" });
    expect(r).toEqual({ path: path.join(tmp, "photo-resized.webp"), renamed: false });
  });

  it("never returns the input path itself", async () => {
    const r = await outputPath(path.join(tmp, "photo.jpg"));
    expect(r.path).toBe(path.join(tmp, "photo-out.jpg"));
  });

  it("collision → -1, -2 and reports it", async () => {
    await fs.writeFile(path.join(tmp, "photo-resized.webp"), "x");
    await fs.writeFile(path.join(tmp, "photo-resized-1.webp"), "x");
    const r = await outputPath(path.join(tmp, "photo.jpg"), { suffix: "-resized", ext: ".webp" });
    expect(r.path).toBe(path.join(tmp, "photo-resized-2.webp"));
    expect(r.renamed).toBe(true);
    expect(renamedNote(r)).toBe(" (photo-resized.webp existed → wrote photo-resized-2.webp)");
  });

  it("dir option creates the directory", async () => {
    const r = await outputPath(path.join(tmp, "photo.jpg"), { dir: path.join(tmp, "out", "deep"), suffix: "-x" });
    expect(r.path).toBe(path.join(tmp, "out", "deep", "photo-x.jpg"));
    expect((await fs.stat(path.join(tmp, "out", "deep"))).isDirectory()).toBe(true);
  });

  it("name option replaces the stem", async () => {
    const r = await outputPath(path.join(tmp, "photo.jpg"), { name: "merged", ext: "pdf" });
    expect(r.path).toBe(path.join(tmp, "merged.pdf"));
  });
});

describe("explicitOutputPath", () => {
  it("rejects an output equal to an input", async () => {
    await expect(explicitOutputPath(path.join(tmp, "photo.jpg"), [path.join(tmp, "photo.jpg")])).rejects.toThrow(/never overwrite inputs/);
  });

  it("suffixes an existing output", async () => {
    const r = await explicitOutputPath(path.join(tmp, "photo-resized.webp"), path.join(tmp, "photo.jpg"));
    expect(r.renamed).toBe(true);
    expect(r.path).toBe(path.join(tmp, "photo-resized-2.webp"));
  });

  it("returns a fresh path unchanged", async () => {
    const r = await explicitOutputPath(path.join(tmp, "fresh.png"), path.join(tmp, "photo.jpg"));
    expect(r).toEqual({ path: path.join(tmp, "fresh.png"), renamed: false });
  });
});
