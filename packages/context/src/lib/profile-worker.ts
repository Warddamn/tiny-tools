// @author AVRG3
import { promises as fs } from "node:fs";
import { detectKind, extractText, resolveInputs } from "@tiny_tools_pw/shared";
import { applyDocumentProfile, type Profile, type ProfileRow } from "./document-profile.js";

/** One bounded worker per batch: parsers cannot hold the MCP process indefinitely. */
async function run({ patterns, profile, profilePath }: { patterns: string[]; profile: Profile; profilePath: string }): Promise<void> {
  const files = await resolveInputs(patterns, { max: 100 });
  if (files.some(f => f.length > 2048)) throw new Error("Input path exceeds 2048 characters.");
  const rows: ProfileRow[] = [];
  let rawBytes = 0, sourceBytes = 0;
  const identities = new Set<string>();
  const recipe = await fs.realpath(profilePath);
  for (const file of files) {
    const issue = (reason: string): void => { rows.push({ file, status: "needs_review", issues: [reason] }); };
    try {
      const real = await fs.realpath(file);
      if (real === recipe) { issue("profile_is_not_a_document"); continue; }
      if (identities.has(real)) continue;
      identities.add(real);
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) { issue("source_limit_or_not_regular_file"); continue; }
      sourceBytes += stat.size;
      if (sourceBytes > 16 * 1024 * 1024) { issue("batch_byte_limit_exceeded"); continue; }
      const kind = detectKind(file);
      if (!(profile.formats as string[]).includes(kind)) { issue("format_not_allowed"); continue; }
      const doc = await extractText(file);
      if (doc.bytes > 2 * 1024 * 1024) { issue("source_limit_exceeded"); continue; }
      rawBytes += doc.textBytes;
      rows.push(applyDocumentProfile(doc, profile));
    } catch { issue("unreadable_or_unparseable_document"); }
  }
  process.send!({ rows, files, rawBytes });
}
process.once("message", (args: Parameters<typeof run>[0]) => {
  void run(args).catch((e: unknown) => process.send!({ error: e instanceof Error ? e.message.slice(0, 1000) : "Batch failed" }));
});
