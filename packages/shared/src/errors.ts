/**
 * Rule 4 — errors that teach. Every error says what went wrong AND what to do next.
 */
export class TeachError extends Error {
  readonly nextStep: string | undefined;
  constructor(message: string, nextStep?: string) {
    super(nextStep ? `${message} — ${nextStep}` : message);
    this.name = "TeachError";
    this.nextStep = nextStep;
  }
}

export function teach(message: string, nextStep?: string): TeachError {
  return new TeachError(message, nextStep);
}

const NODE_ERR_HINTS: Record<string, string> = {
  ENOENT:
    "The path does not exist. Accepts absolute paths, '~' paths, paths relative to the current directory, and globs like './shots/*.png'.",
  EACCES: "Permission denied. Check the file's permissions or choose a different output directory.",
  EPERM: "Operation not permitted. Check the file's permissions or choose a different output directory.",
  EISDIR: "Expected a file but got a directory. Pass a file path or a glob like 'dir/*.csv'.",
  ENOTDIR: "A path segment is not a directory. Check the path.",
  EEXIST: "The output already exists. Omit `output` to auto-suffix (-1, -2…) or pass a new name.",
  EMFILE: "Too many open files. Narrow the glob or process in smaller batches.",
  ENOSPC: "Disk is full. Free space or choose another output directory.",
};

/** Human/agent-readable message for any thrown value. TeachErrors pass through unchanged. */
export function formatError(err: unknown): string {
  if (err instanceof TeachError) return err.message;
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; message?: unknown; path?: unknown; name?: unknown };
    if (typeof e.code === "string" && NODE_ERR_HINTS[e.code]) {
      const where = typeof e.path === "string" ? `: ${e.path}` : "";
      return `${e.code}${where} — ${NODE_ERR_HINTS[e.code]}`;
    }
    if (typeof e.message === "string") {
      const name = typeof e.name === "string" && e.name !== "Error" ? `${e.name}: ` : "";
      return `${name}${e.message}`;
    }
  }
  return String(err);
}

export interface ToolErrorResult {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
}

/** MCP-shaped error result (rule 4). The CLI prints `.content[0].text` to stderr and exits 1. */
export function toolError(err: unknown): ToolErrorResult {
  return { isError: true, content: [{ type: "text", text: formatError(err) }] };
}
