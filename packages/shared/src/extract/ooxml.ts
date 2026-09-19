// @author AVRG3
import { strFromU8, unzipSync } from "fflate";
import { teach } from "../errors.js";

/** Fail fast when a file is not a zip container (OOXML must be). Legacy OLE files get a specific hint. */
export function assertZip(buf: Uint8Array, file: string, expectedExt: string): void {
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return;
  const ole = buf.length >= 2 && buf[0] === 0xd0 && buf[1] === 0xcf;
  if (ole) {
    throw teach(
      `${file} is a legacy binary Office file (.${expectedExt.slice(0, -1)}), not .${expectedExt}.`,
      `Open it in Office/LibreOffice and "Save As" .${expectedExt}, then retry.`,
    );
  }
  throw teach(`${file} is not a valid .${expectedExt} (not a zip container).`, "Check the file isn't truncated or mis-named.");
}

/** Read selected zip entries as UTF-8 strings. */
export function readZipEntries(buf: Uint8Array, want: (name: string) => boolean): Map<string, string> {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(buf, { filter: (f) => want(f.name) });
  } catch (e) {
    throw teach(`Could not unzip the file: ${(e as Error).message}.`, "The file may be corrupted or still being written.");
  }
  const m = new Map<string, string>();
  for (const [name, data] of Object.entries(unzipped)) m.set(name, strFromU8(data));
  return m;
}

export function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (_, e: string) => {
    switch (e) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default: {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : "";
      }
    }
  });
}

/** Attribute value from an opening tag string. */
export function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}="([^"]*)"`);
  const m = re.exec(tag);
  return m ? decodeXml(m[1]!) : undefined;
}

export function stripTags(xml: string): string {
  return decodeXml(xml.replace(/<[^>]+>/g, ""));
}

/** `_rels/*.rels` → Map(Id → Target). */
export function relsMap(relsXml: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!relsXml) return m;
  const re = /<Relationship\s[^>]*>/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(relsXml))) {
    const id = attr(x[0], "Id");
    const target = attr(x[0], "Target");
    if (id && target) m.set(id, target);
  }
  return m;
}

/** Resolve a relationship target relative to a part's folder (handles leading "/"). */
export function resolveTarget(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${baseDir}/${target}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}
