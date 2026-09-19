// @author AVRG3
/** Integration: a real MCP client drives the built server over stdio (listTools + callTool for every tool). */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIX, LEDGER, fx } from "./helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(here, "..", "dist", "mcp.js");

let client: Client;

interface TextResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

async function call(name: string, args: Record<string, unknown>): Promise<TextResult> {
  return (await client.callTool({ name, arguments: args })) as unknown as TextResult;
}

beforeAll(async () => {
  client = new Client({ name: "tiny-context-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], stderr: "pipe" }));
});

afterAll(async () => {
  await client.close();
});

describe("tiny-context MCP server", () => {
  it("lists 8 tools whose descriptions follow the §4.2 template", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["diff_files", "extract", "file_map", "query_file", "query_table", "read_section", "summarize_log", "validate_file"]);
    for (const t of tools) {
      for (const marker of ["USE WHEN:", "PREFER OVER:", "DOES NOT:", "EXAMPLE:", "RETURNS:"]) expect(t.description, `${t.name} lacks ${marker}`).toContain(marker);
      expect(t.inputSchema.type).toBe("object");
      const props = t.inputSchema["properties"] as Record<string, { description?: string }>;
      expect(Object.keys(props).length).toBeGreaterThan(0);
      for (const [k, v] of Object.entries(props)) expect(v.description, `${t.name}.${k} needs a description`).toBeTruthy();
      expect(t.title).toBeTruthy();
    }
  });

  it("exposes server instructions for clients with tool search", () => {
    const ins = client.getInstructions() ?? "";
    expect(ins.length).toBeGreaterThan(300);
    expect(ins.length).toBeLessThan(2000);
    for (const name of ["file_map", "query_file", "read_section", "query_table", "summarize_log", "diff_files", "validate_file", "extract"]) expect(ins).toContain(name);
    expect(ins).toMatch(/PDF.*DOCX.*PPTX.*XLSX/);
  });

  it("file_map", async () => {
    const r = await call("file_map", { path: fx("sample.ts") });
    expect(r.isError).toBeFalsy();
    expect(r.content[0]!.text).toContain("parseConfig");
    expect(r.content[0]!.text).toMatch(LEDGER);
  });

  it("query_file", async () => {
    const r = await call("query_file", { path: fx("sample.pdf"), query: "termination" });
    expect(r.content[0]!.text).toMatch(/#1 page 2/);
    expect(r.content[0]!.text).toMatch(LEDGER);
  });

  it("read_section", async () => {
    const r = await call("read_section", { path: fx("sample.md"), locator: { heading: "Parties" } });
    expect(r.content[0]!.text).toContain("Acme Corp");
    expect(r.content[0]!.text).toMatch(LEDGER);
  });

  it("query_table", async () => {
    const r = await call("query_table", { path: fx("sample.csv"), sql: "SELECT COUNT(*) AS n FROM t WHERE total < 0" });
    expect(r.content[0]!.text).toMatch(/\| 2 \|/);
    expect(r.content[0]!.text).toMatch(LEDGER);
  });

  it("summarize_log", async () => {
    const r = await call("summarize_log", { path: fx("sample.log"), focus: "errors" });
    expect(r.content[0]!.text).toMatch(/×8 ERROR/);
    expect(r.content[0]!.text).toMatch(LEDGER);
  });

  it("diff_files", async () => {
    const r = await call("diff_files", { a: fx("a.md"), b: fx("b.md") });
    expect(r.content[0]!.text).toMatch(/1 changed section/);
    expect(r.content[0]!.text).toMatch(LEDGER);
  });

  it("validate_file", async () => {
    const r = await call("validate_file", { path: fx("ragged.csv") });
    expect(r.content[0]!.text).toMatch(/^FAIL ragged\.csv/);
    expect(r.content[0]!.text).toMatch(LEDGER);
  });

  it("extract", async () => {
    const r = await call("extract", { paths: [`${FIX}/sample.{json,md}`], kind: "emails" });
    expect(r.content[0]!.text).toContain("dana@example.com");
    expect(r.content[0]!.text).toMatch(LEDGER);
  });

  it("teach-errors come back as isError with a next step", async () => {
    const missing = await call("file_map", { path: fx("does-not-exist.txt") });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toMatch(/Input not found: .*does-not-exist\.txt — Pass a file or directory path/);
    const bad = await call("read_section", { path: fx("sample.pdf"), locator: { lines: "1-3" } });
    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toMatch(/only works for plain-text formats.*For a PDF use \{ pages/);
    const sql = await call("query_table", { path: fx("sample.csv"), sql: "SELECT nope FROM t" });
    expect(sql.isError).toBe(true);
    expect(sql.content[0]!.text).toMatch(/columns: region VARCHAR/);
  });

  it("every response is bounded (≤ ~16 KB + ledger)", async () => {
    const r = await call("read_section", { path: fx("sample.log"), locator: { lines: "1-60" }, max_tokens: 8000 });
    expect(Buffer.byteLength(r.content[0]!.text)).toBeLessThan(40_000);
    const big = await call("file_map", { path: path.join(FIX, "..", "..", "..") , depth: 8 });
    expect(Buffer.byteLength(big.content[0]!.text)).toBeLessThan(17_500);
  });
});
