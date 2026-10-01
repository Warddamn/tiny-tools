// @author AVRG3
import { z } from "zod";
import { formatLocation, type ExtractedText } from "@tiny_tools_pw/shared";

const literal = z.string().trim().min(1).max(120).refine(s => !/[\r\n\x00-\x1f]/.test(s), "Use one literal line without control characters");
/** A data-only recipe. No regex, scripts, model calls, source values or learned positions. */
export const DocumentProfile = z.object({
  version: z.literal(1),
  name: literal,
  formats: z.array(z.enum(["text", "markdown", "docx", "pdf"])).min(1).max(4),
  anchors: z.array(literal).min(1).max(8),
  fields: z.array(z.object({
    name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    label: literal.refine(s => s.endsWith(":"), "Labels must end with a colon"),
    type: z.enum(["text", "decimal", "date"]).default("text"),
  }).strict()).min(1).max(16),
}).strict().superRefine((p, ctx) => {
  for (const [key, values] of [["name", p.fields.map(f => f.name)], ["label", p.fields.map(f => f.label)], ["anchor", p.anchors]] as const) {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: `Duplicate ${key}` });
  }
  for (let i = 0; i < p.fields.length; i++) for (let j = i + 1; j < p.fields.length; j++) {
    const a = p.fields[i]!.label, b = p.fields[j]!.label;
    if (a.startsWith(b) || b.startsWith(a)) ctx.addIssue({ code: "custom", message: "Field labels must not overlap" });
  }
});
export type Profile = z.infer<typeof DocumentProfile>;
export interface ProfileRow {
  file: string;
  status: "matched" | "needs_review";
  fields?: Record<string, { value: string; at: string }>;
  issues?: string[];
}

function validValue(value: string, type: Profile["fields"][number]["type"]): boolean {
  if (!value || value.length > 512 || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(value)) return false;
  if (type === "decimal") return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
  if (type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  return true;
}

/** Checks the complete extracted text on each use; matches are not semantic verification. */
export function applyDocumentProfile(doc: ExtractedText, profile: Profile): ProfileRow {
  const row: ProfileRow = { file: doc.path, status: "needs_review" };
  if (!(profile.formats as string[]).includes(doc.kind)) return { ...row, issues: ["format_not_allowed"] };
  if (doc.textBytes > 2 * 1024 * 1024 || doc.blocks.length > 50_000) return { ...row, issues: ["text_limit_exceeded"] };
  const anchors = new Set<string>();
  const hits = profile.fields.map(() => ({ count: 0, value: "", at: "" }));
  let lines = 0;
  for (const block of doc.blocks) for (const raw of block.text.split(/\r?\n/)) {
    if (++lines > 50_000) return { ...row, issues: ["line_limit_exceeded"] };
    const text = raw.trim();
    if (profile.anchors.includes(text)) anchors.add(text);
    profile.fields.forEach((field, i) => {
      if (!text.startsWith(field.label)) return;
      const hit = hits[i]!;
      hit.count++;
      if (hit.count === 1) { hit.value = text.slice(field.label.length).trim(); hit.at = formatLocation(block.loc); }
    });
  }
  const issues: string[] = [];
  if (anchors.size !== profile.anchors.length) issues.push("required_anchor_missing");
  const fields: NonNullable<ProfileRow["fields"]> = Object.create(null) as NonNullable<ProfileRow["fields"]>;
  profile.fields.forEach((field, i) => {
    const hit = hits[i]!;
    if (hit.count !== 1) issues.push(`${field.name}:${hit.count ? "ambiguous" : "missing"}`);
    else if (!validValue(hit.value, field.type)) issues.push(`${field.name}:invalid_${field.type}`);
    else fields[field.name] = { value: hit.value, at: hit.at };
  });
  // Never return a partly valid object as usable output.
  return issues.length ? { ...row, issues } : { ...row, status: "matched", fields };
}
