// @author AVRG3
import { z } from 'zod';
import { fail, field, positiveInt } from './common.js';
import type { CacheAdapter, CacheHint } from './progress.js';

export const HttpSourceSchema = z.object({
  type: z.literal('http'), url: z.string().url(),
  cursorParam: z.string().min(1).max(128).default('cursor'),
  itemsPath: z.string().min(1).default('items'), nextCursorPath: z.string().min(1).default('nextCursor'),
  snapshotPath: z.string().min(1).optional(), totalPath: z.string().min(1).optional(),
  bearerEnv: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
  scope: z.string().min(1).max(512).default('public'),
  maxPageBytes: z.number().int().min(1).max(8_000_000).default(1_000_000),
}).strict();
export type HttpSource = z.infer<typeof HttpSourceSchema>;
function endpoint(raw: string): URL {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) fail('Endpoint must be HTTP(S), without embedded credentials or a fragment.', 'Use bearerEnv for authentication; supply an explicitly trusted endpoint.');
  return url;
}
async function limitedJson(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.ok) { await response.body?.cancel(); return fail(`HTTP ${response.status}.`, 'Check access, service availability and rate limits before resuming.'); }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel(); return fail('Response exceeds the byte limit.', 'Request smaller pages or explicitly increase maxPageBytes.'); }
  const reader = response.body?.getReader();
  if (!reader) fail('Source returned no JSON body.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) fail('Response exceeds the byte limit.', 'Request smaller pages or increase maxPageBytes.'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return fail('Source returned invalid JSON.', 'Fix the source response before resuming.'); }
}
/** Read-only cursor API adapter. Never follow redirects or trust a returned URL as an endpoint. */
export function httpPageSource(raw: z.input<typeof HttpSourceSchema>, env: NodeJS.ProcessEnv = process.env): (cursor: string | null, signal: AbortSignal) => Promise<unknown> {
  const config = HttpSourceSchema.parse(raw), base = endpoint(config.url);
  if (base.searchParams.has(config.cursorParam)) fail('Initial URL already contains the cursor parameter.', 'Remove it; the collector manages this parameter.');
  const token = config.bearerEnv ? env[config.bearerEnv] : undefined;
  if (config.bearerEnv && !token) fail('The configured authentication environment variable is not set.', 'Set it in the tool host environment; never paste a token into a config or prompt.');
  if (token && base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) fail('Authentication over remote plain HTTP is disabled.', 'Use HTTPS for authenticated endpoints.');
  return async (cursor, signal) => {
    const url = new URL(base); if (cursor !== null) url.searchParams.set(config.cursorParam, cursor);
    let response: Response;
    try { response = await fetch(url, { method: 'GET', signal, redirect: 'error', headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }); }
    catch { return fail('Request failed, was redirected, or was cancelled.', 'Verify the original endpoint; redirects are deliberately disabled.'); }
    const body = await limitedJson(response, config.maxPageBytes);
    // Required configured metadata must exist; do not silently turn it into absent validation.
    const required = (name: string) => { const value = field(body, name); if (value === undefined) fail(`Configured response field '${name}' is missing.`, 'Correct the response mapping; a missing next cursor is not end-of-source.'); return value; };
    return { items: required(config.itemsPath), nextCursor: required(config.nextCursorPath),
      ...(config.snapshotPath ? { snapshot: required(config.snapshotPath) } : {}), ...(config.totalPath ? { total: required(config.totalPath) } : {}) };
  };
}
/** Explicit custom engine contract, not a claimed vLLM/hosted-model API. */
export function httpCacheAdapter(url: string, options: { bearerToken?: string; timeoutMs?: number } = {}): CacheAdapter {
  const target = endpoint(url);
  if (options.bearerToken && target.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(target.hostname)) fail('Authentication over remote plain HTTP is disabled.', 'Use HTTPS.');
  const timeout = positiveInt(options.timeoutMs ?? 2000, 'timeoutMs', 60_000);
  return { async apply(hint: CacheHint, signal?: AbortSignal) {
    if (hint.validUntilMs <= Date.now()) fail('Cache hint has expired.', 'Recompute live hints before delivery.');
    const response = await fetch(target, { method: 'POST', redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(Math.max(1, Math.min(timeout, hint.validUntilMs-Date.now()))), ...(signal ? [signal] : [])]), headers: { 'content-type': 'application/json', ...(options.bearerToken ? { authorization: `Bearer ${options.bearerToken}` } : {}) }, body: JSON.stringify({ version: 1, ...hint }) });
    await response.body?.cancel();
    if (!response.ok) fail(`Cache adapter returned HTTP ${response.status}.`, 'Check the serving-engine bridge and its lease contract.');
  } };
}
