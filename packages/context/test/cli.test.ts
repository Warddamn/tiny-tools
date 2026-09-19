// @author AVRG3
import { execFile } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { LEDGER, fx } from "./helpers.js";

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "..", "dist", "cli.js");

async function cli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [CLI, ...args], { maxBuffer: 8 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

describe("tiny-context CLI", () => {
  it("--help lists every command", async () => {
    const r = await cli("--help");
    expect(r.code).toBe(0);
    for (const c of ["map", "query", "read", "table", "log", "diff", "validate", "extract", "tools"]) expect(r.stdout).toMatch(new RegExp(`^  ${c}\\b`, "m"));
  });

  it("map / query / read / extract succeed with exit 0 and a ledger line", async () => {
    const map = await cli("map", fx("sample.md"));
    expect(map.code).toBe(0);
    expect(map.stdout).toContain("## Termination");
    expect(map.stdout).toMatch(LEDGER);
    const query = await cli("query", fx("sample.docx"), "termination notice", "-n", "2");
    expect(query.code).toBe(0);
    expect(query.stdout).toMatch(/#1 ¶/);
    const read = await cli("read", fx("sample.xlsx"), "--sheet", "Sales", "--range", "A1:C2");
    expect(read.code).toBe(0);
    expect(read.stdout).toContain("| 2 | North | 1200.5 | 45658 |");
    const ex = await cli("extract", fx("sample.log"), "-p", "status (\\d+)");
    expect(ex.code).toBe(0);
    expect(ex.stdout).toContain("502 ×8");
  });

  it("table / log / diff / validate", async () => {
    const table = await cli("table", fx("sample.csv"), "SELECT region, SUM(total) AS t FROM t GROUP BY 1 ORDER BY 1");
    expect(table.code).toBe(0);
    expect(table.stdout).toContain("| East | 980 |");
    const log = await cli("log", fx("sample.log"), "--focus", "errors", "-n", "3");
    expect(log.stdout).toMatch(/×8 ERROR/);
    const diff = await cli("diff", fx("a.csv"), fx("b.csv"));
    expect(diff.stdout).toMatch(/\+1 added · −1 removed · ~1 changed/);
    const val = await cli("validate", fx("invalid.json"));
    expect(val.code).toBe(0);
    expect(val.stdout).toMatch(/^FAIL invalid\.json/);
  });

  it("errors: teach message on stderr and exit 1", async () => {
    const r = await cli("map", "/definitely/not/here.txt");
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Input not found: \/definitely\/not\/here\.txt — Pass a file or directory path/);
    const bad = await cli("read", fx("sample.pdf"), "--lines", "1-2");
    expect(bad.code).toBe(1);
    expect(bad.stderr).toMatch(/only works for plain-text formats/);
    const usage = await cli("map");
    expect(usage.code).toBe(1);
    expect(usage.stderr).toMatch(/missing required argument/);
  });
});
