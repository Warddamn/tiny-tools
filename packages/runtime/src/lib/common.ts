// @author AVRG3
import { createHash } from 'node:crypto';

export class RuntimeError extends Error {
  constructor(message: string, next: string) { super(`${message} — ${next}`); this.name = 'RuntimeError'; }
}
export function fail(message: string, next = 'Check the input against the documented schema and retry.'): never {
  throw new RuntimeError(message, next);
}
/** Stable JSON; object key order does not change a fingerprint. Reject non-JSON values. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return fail('Expected finite JSON data (no undefined, BigInt, classes, or cycles).');
}
export function fingerprint(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function field(value: unknown, dotted: string): unknown {
  let node = value;
  for (const part of dotted.split('.')) {
    if (!node || typeof node !== 'object' || !Object.hasOwn(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}
export function errorMessage(e: unknown): string { return e instanceof Error ? e.message : String(e); }
export function positiveInt(value: number, name: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(`${name} must be an integer from 1 to ${max}.`);
  return value;
}
export function nonnegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) fail(`${name} must be finite and nonnegative.`);
  return value;
}
