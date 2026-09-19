import { afterEach, describe, expect, it } from "vitest";
import { detect, installHint, requireBinary, resetDetectCache } from "../src/index.js";

afterEach(() => {
  resetDetectCache();
  delete process.env["TINY_TOOLS_FAKEBIN_PATH"];
});

describe("detect", () => {
  it("finds a binary on PATH", async () => {
    const found = await detect("node");
    expect(found).toBeTruthy();
  });

  it("returns null for a missing binary and caches", async () => {
    expect(await detect("definitely-not-a-binary-xyz")).toBeNull();
    expect(await detect("definitely-not-a-binary-xyz")).toBeNull();
  });

  it("requireBinary throws a teach-error with per-platform install commands", async () => {
    const err = await requireBinary("no-such-binary-abc", "trim video").catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/no-such-binary-abc not found on PATH \(needed to trim video\)/);
    expect(installHint("ffmpeg")).toBe(
      "Install: 'brew install ffmpeg' (macOS) · 'winget install ffmpeg' (Windows) · 'sudo apt install ffmpeg' (Linux), then retry.",
    );
  });

  it("honours the TINY_TOOLS_<NAME>_PATH override", async () => {
    process.env["TINY_TOOLS_FAKEBIN_PATH"] = process.execPath;
    expect(await detect("fakebin")).toBe(process.execPath);
  });
});
