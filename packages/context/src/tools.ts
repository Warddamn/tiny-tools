/**
 * @author AVRG3
 * The tool table: one definition drives the MCP server AND the CLI, so params/descriptions never drift.
 */
import { teach, timed } from "@tinytools/shared";
import type { z } from "zod";
import { diffFiles } from "./lib/diff-files.js";
import { extract } from "./lib/extract.js";
import { fileMap } from "./lib/file-map.js";
import { queryFile } from "./lib/query-file.js";
import { queryTable } from "./lib/query-table.js";
import { readSection } from "./lib/read-section.js";
import { type LibResult, finish } from "./lib/result.js";
import { summarizeLog } from "./lib/summarize-log.js";
import { validateFile } from "./lib/validate-file.js";
import {
  DIFF_FILES_DESCRIPTION,
  DiffFilesInput,
  EXTRACT_DESCRIPTION,
  ExtractInput,
  FILE_MAP_DESCRIPTION,
  FileMapInput,
  QUERY_FILE_DESCRIPTION,
  QUERY_TABLE_DESCRIPTION,
  QueryFileInput,
  QueryTableInput,
  READ_SECTION_DESCRIPTION,
  ReadSectionInput,
  SUMMARIZE_LOG_DESCRIPTION,
  SummarizeLogInput,
  VALIDATE_FILE_DESCRIPTION,
  ValidateFileInput,
} from "./schemas.js";

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** True when the tool can write a file (only with an explicit output param). */
  writes: boolean;
  run: (args: never) => Promise<LibResult>;
}

export const TOOLS: ToolDef[] = [
  { name: "file_map", title: "Outline a file or directory without reading it", description: FILE_MAP_DESCRIPTION, schema: FileMapInput, writes: false, run: fileMap },
  { name: "query_file", title: "Find ranked passages in documents", description: QUERY_FILE_DESCRIPTION, schema: QueryFileInput, writes: false, run: queryFile },
  { name: "read_section", title: "Read one located section of a file", description: READ_SECTION_DESCRIPTION, schema: ReadSectionInput, writes: false, run: readSection },
  { name: "query_table", title: "Query a CSV/XLSX/Parquet with SQL", description: QUERY_TABLE_DESCRIPTION, schema: QueryTableInput, writes: true, run: queryTable },
  { name: "summarize_log", title: "Cluster and time-bucket a log file", description: SUMMARIZE_LOG_DESCRIPTION, schema: SummarizeLogInput, writes: false, run: summarizeLog },
  { name: "diff_files", title: "Compare two files (incl. office formats)", description: DIFF_FILES_DESCRIPTION, schema: DiffFilesInput, writes: false, run: diffFiles },
  { name: "validate_file", title: "Deterministic checks on a generated file", description: VALIDATE_FILE_DESCRIPTION, schema: ValidateFileInput, writes: false, run: validateFile },
  { name: "extract", title: "Pull matches/values out of files", description: EXTRACT_DESCRIPTION, schema: ExtractInput, writes: false, run: extract },
];

export function getTool(name: string): ToolDef {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw teach(`Unknown tool '${name}'.`, `Tools: ${TOOLS.map((t) => t.name).join(", ")}.`);
  return tool;
}

/** Validate → run → append the ledger line. Throws TeachError on bad input. */
export async function runTool(name: string, rawArgs: unknown): Promise<string> {
  const tool = getTool(name);
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(args)"}: ${i.message}`).join("; ");
    throw teach(`Invalid arguments for ${name} — ${issues}.`, "See the tool description for each parameter's default and an example call.");
  }
  const { result, elapsed } = await timed(() => tool.run(parsed.data as never));
  return finish(result, elapsed);
}
