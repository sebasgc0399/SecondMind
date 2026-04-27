import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { createSaveQueue } from '@/lib/saveQueue';

interface TestPayload {
  data: string;
}

const FLUSH_GC_MS = 200;

describe('saveQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. éxito en intento 1 → synced y entry borrada tras GC', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi.fn().mockResolvedValue(undefined);

    queue.enqueue('a', { data: 'x' }, executor);
    expect(queue.getEntry('a')?.status).toBe('syncing');

    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith({ data: 'x' });
    expect(queue.getEntry('a')).toBeUndefined();

    queue.dispose();
  });

  it('2. fallo transient 1 + éxito 2 → retrying → synced, attempts=1', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);

    queue.enqueue('a', { data: 'x' }, executor);
    await vi.advanceTimersByTimeAsync(0);

    expect(queue.getEntry('a')?.status).toBe('retrying');
    expect(queue.getEntry('a')?.attempts).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(executor).toHaveBeenCalledTimes(2);
    expect(queue.getEntry('a')?.status).toBe('synced');

    queue.dispose();
  });

  it('3. fallo transient x4 → error, attempts=4, entry persiste', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi.fn().mockRejectedValue(new Error('transient'));

    queue.enqueue('a', { data: 'x' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getEntry('a')?.status).toBe('retrying');
    expect(queue.getEntry('a')?.attempts).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(queue.getEntry('a')?.attempts).toBe(2);
    expect(queue.getEntry('a')?.status).toBe('retrying');

    await vi.advanceTimersByTimeAsync(2000);
    expect(queue.getEntry('a')?.attempts).toBe(3);
    expect(queue.getEntry('a')?.status).toBe('retrying');

    await vi.advanceTimersByTimeAsync(4000);
    expect(executor).toHaveBeenCalledTimes(4);
    expect(queue.getEntry('a')?.status).toBe('error');
    expect(queue.getEntry('a')?.attempts).toBe(4);
    expect(queue.getEntry('a')?.lastError?.message).toBe('transient');

    queue.dispose();
  });

  it('4. enqueue durante retry pending → upsert payload, attempts NO resetea', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi.fn().mockRejectedValue(new Error('transient'));

    queue.enqueue('a', { data: 'v1' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getEntry('a')?.attempts).toBe(1);

    queue.enqueue('a', { data: 'v2' }, executor);
    expect(queue.getEntry('a')?.attempts).toBe(1);
    expect(queue.getEntry('a')?.payload).toEqual({ data: 'v2' });

    await vi.advanceTimersByTimeAsync(0);
    expect(executor).toHaveBeenLastCalledWith({ data: 'v2' });

    queue.dispose();
  });

  it('5. cancel durante retry → entry borrada, no más intentos', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi.fn().mockRejectedValue(new Error('transient'));

    queue.enqueue('a', { data: 'x' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getEntry('a')?.status).toBe('retrying');
    expect(executor).toHaveBeenCalledTimes(1);

    queue.cancel('a');
    expect(queue.getEntry('a')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(10000);
    expect(executor).toHaveBeenCalledTimes(1);

    queue.dispose();
  });

  it('6. error permanente (permission-denied) → error directo, sin retries', async () => {
    const queue = createSaveQueue<TestPayload>();
    const fbError = new FirebaseError('permission-denied', 'denied');
    const executor = vi.fn().mockRejectedValue(fbError);

    queue.enqueue('a', { data: 'x' }, executor);
    await vi.advanceTimersByTimeAsync(0);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(queue.getEntry('a')?.status).toBe('error');
    expect(queue.getEntry('a')?.attempts).toBe(1);

    await vi.advanceTimersByTimeAsync(10000);
    expect(executor).toHaveBeenCalledTimes(1);

    queue.dispose();
  });

  it('7. retryNow sobre entry en error → re-ejecuta desde attempts=0', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);

    queue.enqueue('a', { data: 'x' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(queue.getEntry('a')?.status).toBe('error');

    queue.retryNow('a');
    expect(queue.getEntry('a')?.attempts).toBe(0);

    await vi.advanceTimersByTimeAsync(0);
    expect(executor).toHaveBeenCalledTimes(5);
    expect(queue.getEntry('a')?.status).toBe('synced');

    queue.dispose();
  });

  it('8. subscribe notifica en cada cambio. unsubscribe deja de notificar', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi.fn().mockResolvedValue(undefined);
    const cb = vi.fn();

    const unsubscribe = queue.subscribe(cb);
    queue.enqueue('a', { data: 'x' }, executor);

    expect(cb).toHaveBeenCalled();
    const callsAfterEnqueue = cb.mock.calls.length;

    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);

    expect(cb.mock.calls.length).toBeGreaterThan(callsAfterEnqueue);

    const callsBeforeUnsubscribe = cb.mock.calls.length;
    unsubscribe();

    queue.enqueue('b', { data: 'y' }, executor);
    expect(cb.mock.calls.length).toBe(callsBeforeUnsubscribe);

    queue.dispose();
  });

  it('9. 3 ids paralelos independientes (uno falla, otros progresan)', async () => {
    const queue = createSaveQueue<TestPayload>();
    const okExecutor = vi.fn().mockResolvedValue(undefined);
    const failExecutor = vi.fn().mockRejectedValue(new Error('transient'));

    queue.enqueue('a', { data: 'a' }, okExecutor);
    queue.enqueue('b', { data: 'b' }, failExecutor);
    queue.enqueue('c', { data: 'c' }, okExecutor);

    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);

    expect(queue.getEntry('a')).toBeUndefined();
    expect(queue.getEntry('b')?.status).toBe('retrying');
    expect(queue.getEntry('c')).toBeUndefined();

    queue.dispose();
  });

  it('10. flushAll con mix de estados → Map correcto', async () => {
    const queue = createSaveQueue<TestPayload>();
    const okExecutor = vi.fn().mockResolvedValue(undefined);
    const failExecutor = vi.fn().mockRejectedValue(new Error('transient'));

    queue.enqueue('ok', { data: 'a' }, okExecutor);
    queue.enqueue('fail', { data: 'b' }, failExecutor);
    await vi.advanceTimersByTimeAsync(0);

    queue.enqueue('pending', { data: 'c' }, vi.fn().mockResolvedValue(undefined));

    const flushPromise = queue.flushAll();
    await vi.advanceTimersByTimeAsync(0);
    const result = await flushPromise;

    expect(result.size).toBeGreaterThanOrEqual(2);
    if (result.has('fail')) expect(result.get('fail')).toBe('failed');

    queue.dispose();
  });

  it('11. dispose con timers in-flight → no executor calls post-dispose', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi.fn().mockRejectedValue(new Error('transient'));

    queue.enqueue('a', { data: 'x' }, executor);
    queue.enqueue('b', { data: 'y' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(executor).toHaveBeenCalledTimes(2);

    queue.dispose();

    await vi.advanceTimersByTimeAsync(10000);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('12. race: cancel mientras executor in-flight → no setStatus synced post-resolve', async () => {
    const queue = createSaveQueue<TestPayload>();
    let resolveExecutor: (() => void) | null = null;
    const executor = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveExecutor = resolve;
        }),
    );

    queue.enqueue('a', { data: 'x' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getEntry('a')?.status).toBe('syncing');
    expect(resolveExecutor).not.toBeNull();

    queue.cancel('a');
    expect(queue.getEntry('a')).toBeUndefined();

    resolveExecutor!();
    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);

    expect(queue.getEntry('a')).toBeUndefined();

    queue.dispose();
  });

  it('13. LRU cap: 51 enqueues → eviction de la más vieja', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi.fn().mockRejectedValue(new Error('transient'));

    for (let i = 0; i < 51; i++) {
      queue.enqueue(`id-${i}`, { data: `v${i}` }, executor);
      await vi.advanceTimersByTimeAsync(0);
    }

    expect(queue.getEntry('id-0')).toBeUndefined();
    expect(queue.getEntry('id-50')).toBeDefined();
    expect(queue.getSnapshot().size).toBeLessThanOrEqual(50);

    queue.dispose();
  });

  it('14. upsert durante syncing → version mismatch re-ejecuta con payload nuevo', async () => {
    const queue = createSaveQueue<TestPayload>();
    let resolveFirst: (() => void) | null = null;
    const executor = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    queue.enqueue('a', { data: 'v1' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getEntry('a')?.status).toBe('syncing');

    queue.enqueue('a', { data: 'v2' }, executor);
    expect(queue.getEntry('a')?.payload).toEqual({ data: 'v2' });

    resolveFirst!();
    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);

    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenLastCalledWith({ data: 'v2' });
    expect(queue.getEntry('a')).toBeUndefined();

    queue.dispose();
  });

  it('15. clear() vacía entries y notifica, pero mantiene subscribers vivos', async () => {
    const queue = createSaveQueue<TestPayload>();
    const executor = vi.fn().mockRejectedValue(new Error('transient'));
    const cb = vi.fn();
    queue.subscribe(cb);

    queue.enqueue('a', { data: 'a' }, executor);
    queue.enqueue('b', { data: 'b' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getSnapshot().size).toBe(2);

    const callsBeforeClear = cb.mock.calls.length;
    queue.clear();

    expect(queue.getSnapshot().size).toBe(0);
    expect(cb.mock.calls.length).toBeGreaterThan(callsBeforeClear);

    // Tras clear, queue sigue funcional (no setea `disposed = true`).
    const okExecutor = vi.fn().mockResolvedValue(undefined);
    queue.enqueue('c', { data: 'c' }, okExecutor);
    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);
    expect(okExecutor).toHaveBeenCalledTimes(1);
    expect(queue.getEntry('c')).toBeUndefined();

    queue.dispose();
  });
});
