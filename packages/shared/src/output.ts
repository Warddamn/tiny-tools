import { promises as fs } from "node:fs";
import * as path from "node:path";
import { teach } from "./errors.js";
import { pathExists, toAbsolute } from "./paths.js";

/**
 * Rule 3 — safe output defaults. Omitted output → next to the input with a suffix; never overwrite
 * an input; existing output → `-1`, `-2`… and say so.
 */
export interface OutputPathOptions {
  suffix?: string;
  /** New extension (with or without the dot). Default: keep the input's. */
  ext?: string;
  /** Output directory. Default: the input's directory. Created if missing. */
  dir?: string;
  /** Replace the file stem entirely. */
  name?: string;
  cwd?: string;
}

export interface OutputPathResult {
  /** Absolute path that is safe to write. */
  path: string;
  /** True when a collision suffix was added. */
  renamed: boolean;
  /** The path that was requested/derived before suffixing (only when renamed). */
  requested?: string;
}

async function withCollisionSuffix(candidate: string): Promise<OutputPathResult> {
  if (!(await pathExists(candidate))) return { path: candidate, renamed: false };
  const ext = path.extname(candidate);
  const stem = candidate.slice(0, candidate.length - ext.length);
  for (let n = 1; n < 10_000; n++) {
    const alt = `${stem}-${n}${ext}`;
    if (!(await pathExists(alt))) return { path: alt, renamed: true, requested: candidate };
  }
  throw teach(`Could not find a free output name near ${candidate}.`, "Pass an explicit `output` path.");
}

/** Derive a safe output path from an input path. */
export async function outputPath(input: string, opts: OutputPathOptions = {}): Promise<OutputPathResult> {
  const absIn = toAbsolute(input, opts.cwd);
  const inExt = path.extname(absIn);
  const ext = opts.ext ? (opts.ext.startsWith(".") ? opts.ext : `.${opts.ext}`) : inExt;
  const stem = opts.name ?? path.basename(absIn, inExt);
  const dir = opts.dir ? toAbsolute(opts.dir, opts.cwd) : path.dirname(absIn);
  await fs.mkdir(dir, { recursive: true });
  let candidate = path.join(dir, `${stem}${opts.suffix ?? ""}${ext}`);
  if (path.resolve(candidate) === path.resolve(absIn)) candidate = path.join(dir, `${stem}-out${ext}`);
  return withCollisionSuffix(candidate);
}

/** Validate a user-supplied output path: never an input; auto-suffix when it exists. */
export async function explicitOutputPath(
  requested: string,
  inputs: string | string[],
  opts: { cwd?: string } = {},
): Promise<OutputPathResult> {
  const abs = toAbsolute(requested, opts.cwd);
  const ins = (Array.isArray(inputs) ? inputs : [inputs]).map((i) => path.resolve(toAbsolute(i, opts.cwd)));
  if (ins.includes(path.resolve(abs))) {
    throw teach(
      `Output path is the same as an input: ${abs}.`,
      "Tools never overwrite inputs. Omit `output` to write next to the input with a suffix, or choose a different name.",
    );
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  return withCollisionSuffix(abs);
}

/** Short note for responses: "" or " (photo-resized.webp existed → wrote photo-resized-1.webp)". */
export function renamedNote(r: OutputPathResult): string {
  if (!r.renamed || !r.requested) return "";
  return ` (${path.basename(r.requested)} existed → wrote ${path.basename(r.path)})`;
}
