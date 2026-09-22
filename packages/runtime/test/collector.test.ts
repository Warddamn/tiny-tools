// @author AVRG3
import { describe, expect, it, vi } from 'vitest';
import { collectPages } from '../src/lib/collector.js';
const row = (id: number, cents = id) => ({ id, cents });
const page = (items: ReturnType<typeof row>[], nextCursor: string | null, total?: number) => ({ items, nextCursor, ...(total === undefined ? {} : { total }) });
const options = { sourceId: 'synthetic-v1', key: 'id', sumFields: ['cents'] };

describe('resumable collector', () => {
  it('does not label a failed first request complete', async () => {
    const result = await collectPages({ ...options, fetchPage: async () => { throw new Error('down'); } });
    expect(result.status).toBe('failed'); expect(result.summary.exhausted).toBe(false); expect(result.summary.pages).toBe(0);
  });
  it('collects all pages and deduplicates before aggregating exact integers', async () => {
    const result = await collectPages({ ...options, fetchPage: async cursor => cursor === null ? page([row(1, 40), row(2, -2)], 'second', 3) : page([row(2, -2), row(3, 5)], null, 3) });
    expect(result.status).toBe('complete'); expect(result.summary).toMatchObject({ records: 3, duplicates: 1, sums: { cents: '43' }, pages: 2, exhausted: true });
  });
  it('can preserve duplicate rows deliberately when no key is specified', async () => {
    const result = await collectPages({ sourceId: 'x', fetchPage: async () => page([row(1), row(1)], null) });
    expect(result.records).toHaveLength(2); expect(result.summary.duplicates).toBe(0);
  });
  it('resumes a middle-page failure from the uncommitted cursor, without double-counting', async () => {
    const first = await collectPages({ ...options, fetchPage: async cursor => { if (cursor) throw new Error('retry later'); return page([row(1)], 'b'); } });
    expect(first.status).toBe('partial');
    const fetchPage = vi.fn(async () => page([row(2)], null));
    const resumed = await collectPages({ ...options, checkpoint: JSON.parse(JSON.stringify(first.checkpoint)), fetchPage });
    expect(fetchPage.mock.calls[0][0]).toBe('b'); expect(resumed.summary.sums.cents).toBe('3'); expect(resumed.status).toBe('complete');
    expect(first.checkpoint.state.records).toHaveLength(1);
  });
  it('makes no request when resuming an already exhausted source', async () => {
    const a = await collectPages({ ...options, fetchPage: async () => page([], null) });
    const fetchPage = vi.fn(); const b = await collectPages({ ...options, checkpoint: a.checkpoint, fetchPage });
    expect(b.status).toBe('complete'); expect(fetchPage).not.toHaveBeenCalled();
  });
  it('rejects changed source, aggregation and damaged checkpoints', async () => {
    const a = await collectPages({ ...options, fetchPage: async () => page([], null) });
    await expect(collectPages({ ...options, sourceId: 'different', checkpoint: a.checkpoint, fetchPage: vi.fn() })).rejects.toThrow(/different source/);
    await expect(collectPages({ ...options, sumFields: [], checkpoint: a.checkpoint, fetchPage: vi.fn() })).rejects.toThrow(/different source/);
    a.checkpoint.state.records.push(row(2));
    await expect(collectPages({ ...options, checkpoint: a.checkpoint, fetchPage: vi.fn() })).rejects.toThrow(/checksum/);
  });
  it('stops repeated cursor cycles without committing the broken page', async () => {
    const r = await collectPages({ ...options, fetchPage: async cursor => cursor === null ? page([row(1)], 'b') : page([row(2)], 'b') });
    expect(r.status).toBe('partial'); expect(r.reason).toBe('cursor_cycle'); expect(r.records).toEqual([row(1)]);
  });
  it('does not interpret a missing cursor field or an empty intermediate page as done', async () => {
    const bad = await collectPages({ ...options, fetchPage: async () => ({ items: [] }) }); expect(bad.status).toBe('failed');
    const good = await collectPages({ ...options, fetchPage: async cursor => cursor === null ? page([], 'b') : page([row(1)], null) });
    expect(good.status).toBe('complete'); expect(good.records).toHaveLength(1);
  });
  it('detects conflicting duplicates atomically', async () => {
    const r = await collectPages({ ...options, fetchPage: async () => page([row(1), row(2), row(1, 9)], null) });
    expect(r.status).toBe('failed'); expect(r.reason).toBe('record_error'); expect(r.records).toEqual([]);
  });
  it('validates IDs and integer fields, preserving exactness beyond Number range', async () => {
    const r = await collectPages({ ...options, fetchPage: async () => ({ items: [{ id: 1, cents: '9007199254740993' }, { id: 2, cents: '7' }], nextCursor: null }) });
    expect(r.summary.sums.cents).toBe('9007199254741000');
    for (const record of [{ id: 1, cents: 0.1 }, { cents: 1 }, { id: null, cents: 2 }, { id: 1, cents: Number.MAX_SAFE_INTEGER + 1 }]) {
      const bad = await collectPages({ ...options, fetchPage: async () => ({ items: [record], nextCursor: null }) }); expect(bad.status).toBe('failed');
    }
  });
  it('detects changed snapshot and totals and rejects incomplete terminal pages', async () => {
    for (const metadata of [{ snapshot: 'v2', total: 2 }, { snapshot: 'v1', total: 3 }]) {
      const r = await collectPages({ ...options, fetchPage: async c => c === null ? { ...page([row(1)], 'b', 2), snapshot: 'v1' } : { ...page([row(2)], null), ...metadata } });
      expect(r.status).toBe('partial'); expect(r.records).toHaveLength(1);
    }
    const r = await collectPages({ ...options, fetchPage: async () => page([row(1)], null, 2) });
    expect(r.status).toBe('failed'); expect(r.reason).toBe('total_mismatch');
  });
  it('enforces page limits and can continue with another bounded invocation', async () => {
    const fetchPage = async (c: string | null) => c === null ? page([row(1)], 'b') : page([row(2)], null);
    const r = await collectPages({ ...options, fetchPage, maxPages: 1 });
    expect(r.status).toBe('partial'); expect(r.reason).toBe('page_limit');
    expect((await collectPages({ ...options, fetchPage, checkpoint: r.checkpoint, maxPages: 1 })).status).toBe('complete');
  });
  it('leaves an oversized page uncommitted and permits resumption with higher limits', async () => {
    for (const limit of [{ maxRecords: 1 }, { maxBytes: 1 }]) {
      const r = await collectPages({ ...options, ...limit, fetchPage: async () => page([row(1), row(2)], null) });
      expect(r.reason).toBe('limit'); expect(r.records).toHaveLength(0);
      expect((await collectPages({ ...options, checkpoint: r.checkpoint, fetchPage: async () => page([row(1), row(2)], null) })).status).toBe('complete');
    }
  });
  it('times out an adapter that ignores cancellation and honors pre-aborted requests', async () => {
    const r = await collectPages({ ...options, timeoutMs: 10, fetchPage: () => new Promise(() => {}) });
    expect(r.reason).toBe('cancelled_or_timeout'); expect(r.status).toBe('failed');
    const fetchPage = vi.fn(); const controller = new AbortController(); controller.abort();
    const b = await collectPages({ ...options, signal: controller.signal, fetchPage });
    expect(b.status).toBe('failed'); expect(fetchPage).not.toHaveBeenCalled();
  });
  it('persists each committed page before asking for the next one', async () => {
    const order: string[] = [];
    await collectPages({ ...options, fetchPage: async c => { order.push(`fetch:${c}`); return c === null ? page([row(1)], 'b') : page([row(2)], null); }, onCheckpoint: async cp => { order.push(`save:${cp.state.pages}`); } });
    expect(order).toEqual(['fetch:null','save:1','fetch:b','save:2']);
  });
  it('propagates disk failures so saved progress is never falsely reported', async () => {
    await expect(collectPages({ ...options, fetchPage: async () => page([row(1)], null), onCheckpoint: async () => { throw new Error('disk full'); } })).rejects.toThrow('disk full');
  });
});
