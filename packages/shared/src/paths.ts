import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { teach } from "./errors.js";

/** `~` and `~/x` → home directory. */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Windows separators → `/` (used for glob matching only; real paths keep the platform separator). */
export function normalizeSeparators(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Absolute, normalized path. Accepts `~`, relative (against cwd) and absolute input. */
export function toAbsolute(p: string, cwd: string = process.cwd()): string {
  return path.resolve(cwd, expandHome(p.trim()));
}

const GLOB_CHARS = /[*?[\]{}]/;
export function isGlob(p: string): boolean {
  return GLOB_CHARS.test(p);
}

/** Convert one glob (on `/`-separated relative paths) to a RegExp. Supports `*`, `**`, `?`, `[abc]`, `{a,b}`. */
export function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${globSource(glob)}$`);
}

function globSource(g: string): string {
  let re = "";
  let i = 0;
  while (i < g.length) {
    const c = g[i]!;
    if (c === "*") {
      if (g[i + 1] === "*") {
        i += 2;
        if (g[i] === "/") {
          re += "(?:.*/)?";
          i++;
        } else re += ".*";
      } else {
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (c === "[") {
      const end = g.indexOf("]", i + 1);
      if (end === -1) {
        re += "\\[";
        i++;
      } else {
        let cls = g.slice(i + 1, end);
        if (cls.startsWith("!")) cls = "^" + cls.slice(1);
        re += `[${cls.replace(/\\/g, "\\\\")}]`;
        i = end + 1;
      }
    } else if (c === "{") {
      const end = g.indexOf("}", i + 1);
      if (end === -1) {
        re += "\\{";
        i++;
      } else {
        const alts = g.slice(i + 1, end).split(",").map(globSource);
        re += `(?:${alts.join("|")})`;
        i = end + 1;
      }
    } else {
      re += c.replace(/[.+^$()|\\]/g, "\\$&");
      i++;
    }
  }
  return re;
}

export type PathKind = "file" | "dir" | "missing";

export async function pathKind(p: string): Promise<PathKind> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory() ? "dir" : "file";
  } catch {
    return "missing";
  }
}

export async function pathExists(p: string): Promise<boolean> {
  return (await pathKind(p)) !== "missing";
}

/**
 * Expand one glob pattern to absolute paths (files and directories), sorted.
 * `node_modules` and `.git` are skipped unless the pattern names them explicitly.
 */
export async function expandGlob(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
  const abs = normalizeSeparators(toAbsolute(pattern, cwd));
  const segs = abs.split("/");
  const firstGlob = segs.findIndex((s) => isGlob(s));
  if (firstGlob === -1) return (await pathExists(abs)) ? [path.normalize(abs)] : [];
  const base = segs.slice(0, firstGlob).join("/") || "/";
  const rest = segs.slice(firstGlob).join("/");
  const re = globToRegExp(rest);
  const deep = rest.includes("**");
  const maxDepth = deep ? Number.POSITIVE_INFINITY : rest.split("/").length;
  const explicitSkip = /node_modules|\.git/.test(rest);
  const out: string[] = [];

  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (!explicitSkip && (ent.name === "node_modules" || ent.name === ".git")) continue;
      const relPath = rel ? `${rel}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (re.test(relPath)) out.push(full);
      if (ent.isDirectory()) await walk(full, relPath, depth + 1);
    }
  }
  await walk(base, "", 1);
  out.sort();
  return out;
}

export interface ResolveOptions {
  cwd?: string;
  /** Allow directories in the result (default false → directories are an error). */
  allowDirs?: boolean;
  /** Maximum number of resolved inputs before a teach-error (default 5000). */
  max?: number;
}

/**
 * Rule 7 — validate before working. Expands globs, checks existence, returns absolute paths,
 * or throws ONE teach-error listing every bad input.
 */
export async function resolveInputs(patterns: string | string[], opts: ResolveOptions = {}): Promise<string[]> {
  const list = (Array.isArray(patterns) ? patterns : [patterns]).map((s) => String(s ?? "").trim()).filter(Boolean);
  if (list.length === 0) {
    throw teach(
      "No input given.",
      "Pass an absolute path, a '~' path, a path relative to the current directory, or a glob like './shots/*.png'.",
    );
  }
  const cwd = opts.cwd ?? process.cwd();
  const max = opts.max ?? 5000;
  const bad: string[] = [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const p of list) {
    if (isGlob(p)) {
      const matches = await expandGlob(p, cwd);
      const usable: string[] = [];
      for (const m of matches) {
        const k = await pathKind(m);
        if (k === "file" || (k === "dir" && opts.allowDirs)) usable.push(m);
      }
      if (usable.length === 0) bad.push(`${p} (glob matched nothing)`);
      for (const f of usable) {
        if (!seen.has(f)) {
          seen.add(f);
          out.push(f);
        }
      }
    } else {
      const abs = toAbsolute(p, cwd);
      const k = await pathKind(abs);
      if (k === "missing") bad.push(`${abs} (not found)`);
      else if (k === "dir" && !opts.allowDirs)
        bad.push(`${abs} (is a directory — pass a file, or a glob like '${p.replace(/[\\/]+$/, "")}/*.ext')`);
      else if (!seen.has(abs)) {
        seen.add(abs);
        out.push(abs);
      }
    }
  }

  if (bad.length) {
    throw teach(
      `Input${bad.length > 1 ? "s" : ""} not usable:\n  - ${bad.join("\n  - ")}`,
      "Accepts absolute paths, '~' paths, paths relative to the current directory, and globs like './shots/*.png'.",
    );
  }
  if (out.length > max) {
    throw teach(`Pattern matched ${out.length} files (cap ${max}).`, "Narrow the glob (add a subfolder or extension) or run in batches.");
  }
  return out;
}
