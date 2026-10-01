// @author AVRG3
import { constants, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { explicitOutputPath, formatError, TeachError, teach, toAbsolute } from "@tiny_tools_pw/shared";
import type { ExtractArgs } from "../schemas.js";
import type { LibResult } from "./result.js";
import { DocumentProfile, type Profile, type ProfileRow } from "./document-profile.js";
import { parseExactJson } from "./strict-json.js";

interface Batch { rows: ProfileRow[]; files: string[]; rawBytes: number }
function batch(patterns: string[], profile: Profile, profilePath: string): Promise<Batch> {
  return new Promise((resolve, reject) => {
    const worker = fork(new URL("../../dist/lib/profile-worker.js", import.meta.url), [], {
      execArgv: ["--max-old-space-size=256"],
      // A parser's incidental output must never corrupt MCP stdout.
      silent: true,
    });
    worker.stdout!.resume(); worker.stderr!.resume();
    let settled = false;
    const done = (error?: Error, value?: Batch): void => {
      if (settled) return; settled = true;
      clearTimeout(timer); worker.kill("SIGKILL");
      if (error) reject(error); else resolve(value!);
    };
    const timer = setTimeout(() => done(teach("Profile batch exceeded 15 seconds.", "Use a smaller batch; no report was written. No automatic model fallback runs.")), 15_000);
    worker.once("message", (value: Batch & { error?: string }) => done(value.error ? teach(value.error, "Check the paths/profile or use a smaller batch.") : undefined, value));
    worker.once("error", () => done(teach("Profile worker failed or exceeded its memory limit.", "Use smaller documents/batches; no report was written.")));
    worker.once("exit", () => done(teach("Profile worker exited before completion.", "Use a smaller batch; no report was written.")));
    worker.send({ patterns, profile, profilePath });
  });
}

export async function extractProfile(args: ExtractArgs): Promise<LibResult> {
  try { return await runProfile(args); }
  catch (e) {
    if (e instanceof TeachError) throw e;
    throw teach(formatError(e).slice(0, 1200), "Check the profile JSON, input paths and output permissions; see docs/DOCUMENT_PROFILES.md.");
  }
}

async function runProfile(args: ExtractArgs): Promise<LibResult> {
  if (args.pattern !== undefined || args.kind !== undefined || args.jq !== undefined || args.ignore_case !== undefined || args.dedupe !== undefined) {
    throw teach("profile cannot be combined with pattern, kind, jq, ignore_case or dedupe.", "Pass profile, path/paths, optional max_matches and optional out.");
  }
  const patterns = [...(args.path ? [args.path] : []), ...(args.paths ?? [])];
  if (!patterns.length || patterns.length > 100 || patterns.some(s => !s.trim() || s.length > 2048)) throw teach("Give 1–100 paths or globs, each at most 2048 characters.", "Use a smaller explicit document batch.");
  const profilePath = toAbsolute(args.profile!);
  const handle = await fs.open(profilePath, constants.O_RDONLY | constants.O_NONBLOCK);
  let source: string, digest: string;
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > 16_384n) throw new Error("Profile must be a regular JSON file, at most 16 KiB.");
    const buffer = Buffer.alloc(16_385);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat({ bigint: true });
    if (bytesRead > 16_384 || BigInt(bytesRead) !== before.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("Profile is too large or changed during reading.");
    const bytes = buffer.subarray(0, bytesRead);
    digest = createHash("sha256").update(bytes).digest("hex");
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { await handle.close(); }
  const parsed = DocumentProfile.safeParse(parseExactJson(source));
  if (!parsed.success) throw teach(`Invalid document profile: ${parsed.error.issues.map(i => i.message).join("; ").slice(0, 1200)}.`, "Use the version 1 example in docs/DOCUMENT_PROFILES.md. Unknown keys are rejected.");
  const profile = parsed.data;
  const result = await batch(patterns, profile, profilePath);
  const matched = result.rows.filter(r => r.status === "matched").length;
  const summary = {
    profile: profile.name, profile_sha256: digest,
    files: result.rows.length, matched, needs_review: result.rows.length - matched,
    scope: "Literal labels and required anchors only; not semantic verification or whole-document change detection.",
  };
  let report: string | undefined;
  if (args.out) {
    const output = await explicitOutputPath(args.out, [...result.files, profilePath]);
    const body = [summary, ...result.rows].map(r => JSON.stringify(r)).join("\n") + "\n";
    // Exclusive creation protects against a name appearing after collision resolution.
    const handle = await fs.open(output.path, "wx", 0o600);
    try { await handle.writeFile(body); await handle.close(); }
    catch (e) { await handle.close(); await fs.unlink(output.path); throw e; }
    report = output.path;
  }
  const preview: ProfileRow[] = [];
  const next = "Use out for a complete JSONL report or narrow the batch. Omitted rows were checked.";
  const metadata = { ...summary, ...(report ? { report } : {}) };
  let used = Buffer.byteLength(JSON.stringify({ ...metadata, rows: [], omitted: 100, next }));
  // Surface exceptions before ordinary matches so a clipped preview doesn't cause a repeat batch.
  const ordered = [...result.rows.filter(r => r.status === "needs_review"), ...result.rows.filter(r => r.status === "matched")];
  for (const row of ordered) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (preview.length >= (args.max_matches ?? 20) || used + size > 15_000) break;
    used += size; preview.push(row);
  }
  const text = JSON.stringify({ ...metadata, rows: preview, omitted: result.rows.length - preview.length,
    ...(preview.length < result.rows.length && !report ? { next } : {}),
  });
  return { text, rawBytes: result.rawBytes };
}
