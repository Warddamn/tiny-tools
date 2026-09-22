// @author AVRG3
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fail } from './common.js';

export function absolute(input: string): string { return path.resolve(input.startsWith('~/') ? path.join(os.homedir(), input.slice(2)) : input); }
export async function readJson(input: string, maxBytes = 64_000_000): Promise<{ value: unknown; bytes: number }> {
  const filename = absolute(input);
  let handle;
  try { handle = await fs.open(filename, 'r'); }
  catch { return fail(`Cannot open input: ${filename}.`, 'Provide an existing readable JSON file.'); }
  try {
    if (!(await handle.stat()).isFile()) fail(`Expected a file: ${filename}.`);
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      bytes += chunk.length;
      if (bytes > maxBytes) fail(`Input exceeds ${maxBytes} bytes.`, 'Split the input into smaller jobs.');
      chunks.push(chunk as Buffer);
    }
    try { return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')), bytes }; }
    catch { return fail(`Invalid JSON: ${filename}.`, 'Fix JSON syntax and retry.'); }
  } finally { await handle.close(); }
}
export async function jobDirectory(input: string, outputDir?: string): Promise<string> {
  const root = outputDir ? absolute(outputDir) : path.dirname(absolute(input));
  await fs.mkdir(root, { recursive: true });
  return fs.mkdtemp(path.join(root, 'tiny-runtime-'));
}
/** Only call on files owned by the fresh job directory. Checkpoint replacement is atomic. */
export async function atomicJson(filename: string, data: unknown, signal?: AbortSignal): Promise<void> {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try { signal?.throwIfAborted(); await fs.writeFile(temporary, JSON.stringify(data) + '\n', { flag: 'wx', mode: 0o600, signal }); signal?.throwIfAborted(); await fs.rename(temporary, filename); }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
