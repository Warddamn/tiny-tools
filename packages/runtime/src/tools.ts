// @author AVRG3
import { CollectInput, DESCRIPTIONS, FileInput } from './schemas.js';
import { collectJob, guardJob, cacheJob } from './lib/jobs.js';
import { errorMessage } from './lib/common.js';
export const TOOLS = [
  { name: 'collect_pages', title: 'Finish a paginated collection', schema: CollectInput, run: collectJob, openWorld: true },
  { name: 'check_progress', title: 'Detect repeated work without progress', schema: FileInput, run: guardJob, openWorld: false },
  { name: 'plan_cache', title: 'Plan cache hints from tool progress', schema: FileInput, run: cacheJob, openWorld: false },
] as const;
export { DESCRIPTIONS };
export async function runTool(name: string, input: unknown): Promise<{ ok: boolean; text: string }> {
  const started = performance.now();
  try {
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw new Error(`Unknown tool. Choose ${TOOLS.map(t => t.name).join(', ')}.`);
    const result = await tool.run(input);
    const text = JSON.stringify({ ...result.summary, files: result.files }, null, 2);
    const bounded = Buffer.byteLength(text) <= 14_000 ? text : JSON.stringify({ status: result.summary.status, summaryTruncated: true, nextStep: 'Read the saved report for full details.', files: result.files });
    return { ok: result.ok, text: `${Buffer.from(bounded).subarray(0, 14_000).toString('utf8')}\nfiles: ${result.files.length} · ${Math.round(performance.now() - started)}ms` };
  } catch (e) {
    return { ok: false, text: `${errorMessage(e).slice(0, 3000)} — Check the JSON job format in packages/runtime/README.md and retry.\nfiles: 0 · ${Math.round(performance.now() - started)}ms` };
  }
}
