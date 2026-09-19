export async function timed<T>(fn: () => T | Promise<T>): Promise<{ result: T; elapsed: number }> {
  const t0 = performance.now();
  const result = await fn();
  return { result, elapsed: performance.now() - t0 };
}
