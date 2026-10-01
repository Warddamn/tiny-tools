// @author AVRG3
export * from "./schemas.js";
export { fileMap } from "./lib/file-map.js";
export { queryFile, tokenize, chunkBlocks, bm25 } from "./lib/query-file.js";
export { readSection } from "./lib/read-section.js";
export { extract, evalJqSubset, KIND_PATTERNS } from "./lib/extract.js";
export { queryTable } from "./lib/query-table.js";
export { summarizeLog, parseTimestamp, templateOf } from "./lib/summarize-log.js";
export { diffFiles } from "./lib/diff-files.js";
export { compareRecords } from "./lib/diff-records.js";
export type { RecordComparison, RecordChange } from "./lib/diff-records.js";
export { diffLines, hunksOf } from "./lib/diff.js";
export { validateFile } from "./lib/validate-file.js";
export { finish, parseRange, describeRange, fmtBytes } from "./lib/result.js";
export type { LibResult } from "./lib/result.js";
export { outlineCode, languageFor } from "./lib/code-outline.js";

export { DocumentProfile, applyDocumentProfile, type Profile, type ProfileRow } from "./lib/document-profile.js";
