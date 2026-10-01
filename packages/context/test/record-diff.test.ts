// @author AVRG3
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareRecords } from "../src/lib/diff-records.js";
import { parseExactJson } from "../src/lib/strict-json.js";
import { runTool } from "../src/tools.js";

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "tiny-records-")); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });
const input = async (name: string, data: unknown): Promise<string> => {
  const file = path.join(dir, name); await fs.writeFile(file, typeof data === "string" ? data : JSON.stringify(data)); return file;
};
const call = (a: string, b: string, more: Record<string, unknown> = {}) => runTool("diff_files", { a, b, mode: "records", key: ["/id"], ...more });

describe("record comparison correctness", () => {
  it("ignores record/object key order but catches additions, removals and exact changes", () => {
    const a = [{ id: "A", status: "open", nested: { x: 1, y: 2 } }, { id: "B", status: "open" }, { id: "D" }];
    const b = [{ id: "C" }, { status: "closed", id: "B" }, { nested: { y: 2, x: 1 }, status: "open", id: "A" }];
    const r = compareRecords(a, b, ["/id"]);
    expect(r.counts).toEqual({ before: 3, after: 3, added: 1, removed: 1, changed: 1, unchanged: 1 });
    expect(r.changes.find(c => c.kind === "changed")?.fields).toEqual([{ path: "/status", before: { present: true, value: "open" }, after: { present: true, value: "closed" } }]);
  });
  it("uses collision-free typed composite keys and supports escaped pointers", () => {
    const a = [{ account: "a,b", id: "c", "a/b": { "~": 1 } }, { account: "a", id: "b,c", "a/b": { "~": 2 } }, { account: "a", id: 1 }, { account: "a", id: "1" }];
    const b = structuredClone(a).reverse(); b[3]!["a/b"] = { "~": 3 };
    const r = compareRecords(a, b, ["/account", "/id"], ["/a~1b/~0"]);
    expect(r.counts.changed).toBe(1); expect(r.changes[0]?.key).toEqual(["a,b", "c"]);
  });
  it("distinguishes absent/null/false/zero/empty and preserves nested array order", () => {
    const a = [{ id: 1 }, { id: 2, x: null }, { id: 3, x: 0 }, { id: 4, x: "" }, { id: 5, x: [1, 2] }];
    const b = [{ id: 1, x: null }, { id: 2, x: false }, { id: 3, x: "0" }, { id: 4 }, { id: 5, x: [2, 1] }];
    expect(compareRecords(a, b, ["/id"]).counts.changed).toBe(5);
  });
  it("selected fields ignore timestamp noise but still count added/removed records", () => {
    const r = compareRecords([{ id: 1, status: "open", checked: 1 }, { id: 3 }], [{ id: 1, status: "open", checked: 9 }, { id: 2 }], ["/id"], ["/status"]);
    expect(r.counts).toEqual({ before: 2, after: 2, added: 1, removed: 1, changed: 0, unchanged: 1 });
    expect(() => compareRecords([{ id: 1 }], [{ id: 1 }], ["/id"], ["/typo"])).toThrow(/absent/);
  });
  it.each([{ rows: [{ id: 1 }, { id: 1 }], error: /duplicate keys/ }, { rows: [{ x: 1 }], error: /invalid key/ }, { rows: [{ id: null }], error: /invalid key/ }, { rows: [{ id: "" }], error: /invalid key/ }, { rows: [4], error: /not an object/ }])("refuses ambiguous records %#", ({ rows, error }) => {
    expect(() => compareRecords(rows, [], ["/id"])).toThrow(error);
  });
  it("compares identical inputs and empty arrays correctly", () => {
    expect(compareRecords([], [], ["/id"]).counts.changed).toBe(0);
    expect(compareRecords([{ id: 1 }], [{ id: 1 }], ["/id"]).counts.unchanged).toBe(1);
  });
  it("does not follow inherited properties or confuse prototype-named keys", () => {
    const a = JSON.parse('[{"id":"__proto__","__proto__":{"x":1},"constructor":2}]');
    const b = JSON.parse('[{"id":"__proto__","__proto__":{"x":2},"constructor":2}]');
    expect(compareRecords(a, b, ["/id"], ["/__proto__/x"]).counts.changed).toBe(1);
    expect(() => compareRecords([{}], [], ["/toString"])).toThrow();
  });
});

describe("precise JSON input", () => {
  it.each(['{"id":9007199254740993}', '{"x":0.10000000000000000001}', '{"x":1e999}', '{"x":1e-999}', '{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '[1,]', '{"a":1,}', 'true false', '"bad\nstring"'])("rejects lossy/invalid %s", value => { expect(() => parseExactJson(value)).toThrow(); });
  it.each(['{"id":"9007199254740993","price":19.99}', '[1.0, 1e0, 0, 1e-7, 1.23e+22]', '{"text":"escaped \\" \\\\ \\u0078","nested":{"x":1}}'])("accepts exact JSON %s", value => { expect(parseExactJson(value)).toEqual(JSON.parse(value)); });
  it("normalizes signed zero consistently with JSON report serialization", async () => {
    const a = await input("a.json", '[{"id":1,"x":-0}]'); const b = await input("b.json", '[{"id":1,"x":0}]');
    expect(await call(a, b)).toContain('"unchanged":1');
  });
  it("rejects excessive nesting and malformed pointers", () => {
    expect(() => parseExactJson("[".repeat(66) + "0" + "]".repeat(66))).toThrow(/nesting/);
    expect(() => compareRecords([{ id: 1 }], [], ["id"])).toThrow(/Pointer/);
    expect(() => compareRecords([{ id: 1 }], [], ["/~2"])).toThrow(/Pointer/);
  });
});

describe("file/CLI boundary and bounded output", () => {
  it("reads wrapped JSON and exports every change, safely suffixing collisions", async () => {
    const a = await input("a.json", { data: [{ id: 1, status: "open" }] });
    const b = await input("b.json", { data: [{ id: 1, status: "closed" }, { id: 2, status: "open" }] });
    const out = await input("changes.jsonl", "KEEP");
    const result = await call(a, b, { records_path: "/data", out, max_hunks: 1 });
    expect(result).toContain("Preview: 1/2"); expect(result).toContain("changes-1.jsonl");
    const report = (await fs.readFile(path.join(dir, "changes-1.jsonl"), "utf8")).trim().split("\n").map(s => JSON.parse(s));
    expect(report).toHaveLength(3); expect(report[0].counts.changed).toBe(1); expect(report[0].counts.added).toBe(1);
    expect(await fs.readFile(out, "utf8")).toBe("KEEP");
    await expect(call(a, b, { records_path: "/data", out: a })).rejects.toThrow(/same as an input/);
    expect(JSON.parse(await fs.readFile(a, "utf8")).data[0].status).toBe("open");
  });
  it("reads JSONL and NDJSON in different orders, with blank lines", async () => {
    const a = await input("a.jsonl", '{"id":1,"x":2}\n\n{"id":2,"x":3}\n');
    const b = await input("b.ndjson", '{"x":3,"id":2}\n{"x":2,"id":1}\n');
    expect(await call(a, b)).toContain('"unchanged":2');
    await expect(call(a, b, { records_path: "/data" })).rejects.toThrow(/only applies/);
  });
  it("labels exclusions and clipped previews, keeps exact totals and bounded UTF-8 bytes", async () => {
    const a = await input("a.json", []);
    const b = await input("b.json", Array.from({ length: 150 }, (_, id) => ({ id, x: "🧶".repeat(3000) })));
    const text = await call(a, b, { fields: ["/x"], max_hunks: 100 });
    expect(text).toContain('"added":150'); expect(text).toContain("values clipped"); expect(text).toContain("Only selected fields");
    expect(Buffer.byteLength(text)).toBeLessThan(16_000);
  });
  it("fails before creating output on invalid or oversized data", async () => {
    const a = await input("a.json", [{ id: 1 }]); const b = await input("b.json", '[{"id":9007199254740993}]');
    const out = path.join(dir, "no.jsonl");
    await expect(call(a, b, { out })).rejects.toThrow(/precision/);
    await expect(fs.access(out)).rejects.toThrow();
    await fs.truncate(b, 17 * 1024 * 1024);
    await expect(call(a, b)).rejects.toThrow(/16 MiB/);
  });
  it("rejects invalid UTF-8 and record-only options in other modes", async () => {
    const a = await input("a.json", []); const b = await input("b.json", []);
    await fs.writeFile(b, Buffer.from([0xff]));
    await expect(call(a, b)).rejects.toThrow(/UTF-8/);
    await expect(runTool("diff_files", { a, b, key: ["/id"] })).rejects.toThrow(/require mode/);
    await expect(call(a, a, { key: [] })).rejects.toThrow(/Invalid arguments/);
  });
  it("validates both full snapshots even when only one preview is requested", async () => {
    const a = await input("a.json", []); const b = await input("b.json", [{ id: 1 }, { id: 2 }, { id: 2 }]);
    await expect(call(a, b, { max_hunks: 1 })).rejects.toThrow(/duplicate keys/);
    await expect(call(a, a, { records_path: "/missing" })).rejects.toThrow(/not an array/);
    const text = await input("note.txt", "hello");
    await expect(call(text, text)).rejects.toThrow(/supports .json/);
  });
  it("CLI exposes the same record comparison and error behavior", async () => {
    const a = await input("a.json", [{ id: "A", status: "open" }]); const b = await input("b.json", [{ id: "A", status: "closed" }]);
    const cli = path.resolve("packages/context/dist/cli.js");
    const result = execFileSync(process.execPath, [cli, "diff", a, b, "--mode", "records", "--key", "/id", "--fields", "/status"], { encoding: "utf8" });
    expect(result).toContain('"changed":1'); expect(result).toContain('"closed"');
  });
});
