// @author AVRG3
import { promises as fs } from "node:fs";
import { teach } from "../errors.js";
import type { ExtractedText, TextBlock } from "./types.js";

export interface OutlineItem {
  title: string;
  page: number | null;
  level: number;
}

export async function extractPdf(file: string): Promise<ExtractedText> {
  const buf = await fs.readFile(file);
  if (buf.subarray(0, 1024).indexOf("%PDF") === -1) {
    throw teach(`${file} is not a PDF (no %PDF header).`, "Check the file; if it's an image scan, OCR is out of scope for tiny-context.");
  }
  let unpdf: typeof import("unpdf");
  try {
    unpdf = await import("unpdf");
  } catch {
    throw teach("PDF support needs the 'unpdf' package, which failed to load.", "Run `npm install unpdf` in the tiny-tools install, then retry.");
  }
  let pdf: Awaited<ReturnType<typeof unpdf.getDocumentProxy>>;
  try {
    pdf = await unpdf.getDocumentProxy(new Uint8Array(buf));
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/password|encrypt/i.test(msg)) {
      throw teach(`${file} is password-protected.`, "Remove the password first (e.g. `qpdf --decrypt in.pdf out.pdf`), then retry.");
    }
    throw teach(`Could not parse PDF ${file}: ${msg}.`, "The file may be corrupted or truncated.");
  }
  const { totalPages, text } = await unpdf.extractText(pdf, { mergePages: false });
  const blocks: TextBlock[] = [];
  let emptyPages = 0;
  text.forEach((pageText, i) => {
    const lines = pageText.split(/\r?\n/);
    let n = 0;
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) continue;
      n++;
      blocks.push({ text: line, loc: { page: i + 1, line: n }, kind: "text" });
    }
    if (n === 0) emptyPages++;
  });

  const outline: OutlineItem[] = [];
  try {
    const items = (await pdf.getOutline()) ?? [];
    const walk = async (list: Array<{ title: string; dest: unknown; items?: unknown[] }>, level: number): Promise<void> => {
      for (const it of list) {
        if (outline.length >= 200) return;
        let page: number | null = null;
        try {
          let dest = it.dest;
          if (typeof dest === "string") dest = await pdf.getDestination(dest);
          if (Array.isArray(dest) && dest[0]) page = (await pdf.getPageIndex(dest[0])) + 1;
        } catch {
          /* unresolved destination */
        }
        outline.push({ title: String(it.title ?? "").trim(), page, level });
        if (Array.isArray(it.items) && it.items.length) await walk(it.items as typeof list, level + 1);
      }
    };
    await walk(items as Array<{ title: string; dest: unknown; items?: unknown[] }>, 1);
  } catch {
    /* no outline */
  }

  let info: Record<string, unknown> = {};
  try {
    const meta = await unpdf.getMeta(pdf);
    const raw = (meta?.info ?? {}) as Record<string, unknown>;
    for (const k of ["Title", "Author", "Subject", "Producer", "Creator", "CreationDate"]) if (raw[k]) info[k] = raw[k];
  } catch {
    info = {};
  }

  const textBytes = Buffer.byteLength(blocks.map((b) => b.text).join("\n"), "utf8");
  return {
    path: file,
    kind: "pdf",
    bytes: buf.length,
    textBytes,
    blocks,
    meta: { pages: totalPages, emptyPages, scanned: totalPages > 0 && emptyPages === totalPages, outline, info },
  };
}
