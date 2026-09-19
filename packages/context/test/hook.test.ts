// @author AVRG3
/** The Read guard hook: deny + outline for PDF/Office/large files; stay out of the way otherwise. */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fx } from "./helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(here, "..", "hooks", "read-guard.mjs");

interface HookOut {
  code: number | null;
  stdout: string;
  decision?: { permissionDecision: string; permissionDecisionReason: string };
}

function runHook(input: unknown, env: Record<string, string> = {}): Promise<HookOut> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.on("close", (code) => {
      let decision: HookOut["decision"];
      try {
        decision = (JSON.parse(stdout) as { hookSpecificOutput: HookOut["decision"] }).hookSpecificOutput;
      } catch {
        decision = undefined;
      }
      resolve({ code, stdout, decision });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

const read = (file_path: string, extra: Record<string, unknown> = {}) => ({ tool_name: "Read", tool_input: { file_path, ...extra }, cwd: process.cwd() });

let tmp: string;
let bigMd: string;
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-hook-"));
  bigMd = path.join(tmp, "big.md");
  const lines = ["# Big doc", ""];
  for (let i = 1; i <= 40; i++) lines.push(`## Section ${i}`, "", "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(6), "");
  await fs.writeFile(bigMd, lines.join("\n"));
});
afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("read-guard hook", () => {
  it("denies Read of a PDF and returns its outline + next steps", async () => {
    const r = await runHook(read(fx("sample.pdf")));
    expect(r.code).toBe(0);
    expect(r.decision?.permissionDecision).toBe("deny");
    expect(r.decision?.permissionDecisionReason).toMatch(/Read cannot open \.pdf files/);
    expect(r.decision?.permissionDecisionReason).toMatch(/sample\.pdf — pdf · 3 pages/);
    expect(r.decision?.permissionDecisionReason).toMatch(/read_section\(\{ path, locator/);
    expect(r.decision?.permissionDecisionReason).toMatch(/Returned ~[\d,]+ tokens/);
  });

  it("denies Read of a large text file, allows it once TINY_CONTEXT_READ_GUARD_KB is raised", async () => {
    const r = await runHook(read(bigMd));
    expect(r.decision?.permissionDecision).toBe("deny");
    expect(r.decision?.permissionDecisionReason).toMatch(/this file is \d+ KB/);
    expect(r.decision?.permissionDecisionReason).toMatch(/## Section 1/);
    const relaxed = await runHook(read(bigMd), { TINY_CONTEXT_READ_GUARD_KB: "100" });
    expect(relaxed.code).toBe(0);
    expect(relaxed.stdout).toBe("");
  });

  it("stays out of the way: small file, offset/limit given, other tools, missing file, images", async () => {
    for (const input of [
      read(fx("sample.md")),
      read(fx("sample.pdf"), { offset: 1, limit: 50 }),
      { tool_name: "Grep", tool_input: { pattern: "x" } },
      read(fx("does-not-exist.pdf")),
      read(fx("binary.bin")),
      { tool_name: "Read", tool_input: {} },
    ]) {
      const r = await runHook(input);
      expect(r.code, JSON.stringify(input)).toBe(0);
      expect(r.stdout, JSON.stringify(input)).toBe("");
    }
  });

  it("survives garbage on stdin", async () => {
    const r = await new Promise<HookOut>((resolve) => {
      const child = spawn(process.execPath, [HOOK], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.on("close", (code) => resolve({ code, stdout }));
      child.stdin.end("not json");
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });
});
