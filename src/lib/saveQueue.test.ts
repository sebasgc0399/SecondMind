import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { createSaveQueue, RESYNC_TIMEOUT_MS } from '@/lib/saveQueue';

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

  it('16. F30: queue de creates acepta payload con field extra-schema y status transitions normales', async () => {
    interface CreatePayload {
      title: string;
      contentPlain: string;
      content?: string;
    }
    const queue = createSaveQueue<CreatePayload>();
    const executor = vi.fn().mockResolvedValue(undefined);

    const payload: CreatePayload = {
      title: 'Nota desde inbox',
      contentPlain: 'línea 1',
      content: '{"type":"doc","content":[]}',
    };

    queue.enqueue('note-1', payload, executor);
    expect(queue.getEntry('note-1')?.status).toBe('syncing');

    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(payload);
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({ content: payload.content }));
    expect(queue.getEntry('note-1')).toBeUndefined();

    queue.dispose();
  });

  // ── SPEC-57 (D13): re-disparo del upsert subsiguiente vía timeout ───────────
  // Gate timeout (no navigator.onLine: queda true offline en el WebView Android).
  // "offline" se simula con un executor que no resuelve (el setDoc espera el ack
  // del server, que offline no llega). El re-disparo lo dispara RESYNC_TIMEOUT_MS.

  it('17. F2a (durabilidad): offline, upsert durante syncing → al cumplirse el timeout re-dispara setDoc(v2)', async () => {
    const queue = createSaveQueue<TestPayload>();
    const deferreds: Array<() => void> = [];
    const executor = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            deferreds.push(resolve);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            deferreds.push(resolve);
          }),
      )
      .mockResolvedValue(undefined);

    queue.enqueue('a', { data: 'v1' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getEntry('a')?.status).toBe('syncing');
    expect(executor).toHaveBeenCalledTimes(1);

    // upsert durante syncing: NO re-dispara inmediato (el in-flight podría ackear);
    // arma el resync timer.
    queue.enqueue('a', { data: 'v2' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(queue.getEntry('a')?.payload).toEqual({ data: 'v2' });
    expect(queue.getEntry('a')?.resyncTimerId).not.toBeNull();

    // offline: el in-flight nunca ackea. Al cumplirse RESYNC_TIMEOUT_MS, re-dispara v2
    // a la mutation-queue durable del SDK.
    await vi.advanceTimersByTimeAsync(RESYNC_TIMEOUT_MS);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenNthCalledWith(2, { data: 'v2' });

    // reconexión: ambos setDoc resuelven → estado final v2, synced + GC.
    deferreds.forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);
    expect(executor).toHaveBeenLastCalledWith({ data: 'v2' });
    expect(queue.getEntry('a')).toBeUndefined();

    queue.dispose();
  });

  it('18. F2b (F29): offline, re-disparo por timeout + ambos intentos permission-denied → error, sin backoff', async () => {
    const queue = createSaveQueue<TestPayload>();
    const fbError = new FirebaseError('permission-denied', 'denied');
    const rejecters: Array<(e: unknown) => void> = [];
    const executor = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejecters.push(reject);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejecters.push(reject);
          }),
      )
      .mockRejectedValue(fbError);

    queue.enqueue('a', { data: 'v1' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(executor).toHaveBeenCalledTimes(1);

    queue.enqueue('a', { data: 'v2' }, executor);
    await vi.advanceTimersByTimeAsync(0);
    expect(executor).toHaveBeenCalledTimes(1);

    // timeout → re-dispara v2 (segundo intento in-flight).
    await vi.advanceTimersByTimeAsync(RESYNC_TIMEOUT_MS);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenNthCalledWith(2, { data: 'v2' });

    // reconexión: ambos rechazan permission-denied → fast-fail F29 por el path re-disparado.
    rejecters.forEach((reject) => reject(fbError));
    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);
    expect(queue.getEntry('a')?.status).toBe('error');

    // permanente → sin retries de backoff: avanzar el tiempo no re-ejecuta.
    const callsAtError = executor.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(executor).toHaveBeenCalledTimes(callsAtError);

    queue.dispose();
  });

  it('19. F2c (no-regresión online): ack < N → version-check coalesce, el timer NO re-dispara (cero over-fire)', async () => {
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
    expect(executor).toHaveBeenCalledTimes(1);

    // upsert durante syncing: NO re-dispara inmediato; arma el resync timer.
    queue.enqueue('a', { data: 'v2' }, executor);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(queue.getEntry('a')?.payload).toEqual({ data: 'v2' });
    expect(queue.getEntry('a')?.resyncTimerId).not.toBeNull();

    // ONLINE: el in-flight ackea ANTES de N → el version-check re-ejecuta con v2
    // (coalesce) y executeEntry limpia el resync timer.
    resolveFirst!();
    await vi.advanceTimersByTimeAsync(FLUSH_GC_MS);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenLastCalledWith({ data: 'v2' });
    expect(queue.getEntry('a')).toBeUndefined();

    // avanzar más allá de N NO dispara un re-disparo espurio: el timer fue cancelado.
    await vi.advanceTimersByTimeAsync(RESYNC_TIMEOUT_MS);
    expect(executor).toHaveBeenCalledTimes(2);

    queue.dispose();
  });

  it('20. F2d (lifecycle): dispose/clear/cancel limpian el resync timer pendiente (sin leak ni re-disparo)', async () => {
    // Executor que nunca resuelve: el entry queda en syncing con un resync timer vivo
    // (el ÚNICO timer pendiente — sin GC ni backoff), que es justo el caso donde el
    // timer dispararía si el ending no lo limpiara.
    const never = () => new Promise<void>(() => {});

    // dispose
    const q1 = createSaveQueue<TestPayload>();
    const e1 = vi.fn().mockImplementation(never);
    q1.enqueue('a', { data: 'v1' }, e1);
    await vi.advanceTimersByTimeAsync(0);
    q1.enqueue('a', { data: 'v2' }, e1);
    expect(q1.getEntry('a')?.resyncTimerId).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    q1.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(RESYNC_TIMEOUT_MS + 1000);
    expect(e1).toHaveBeenCalledTimes(1);

    // clear
    const q2 = createSaveQueue<TestPayload>();
    const e2 = vi.fn().mockImplementation(never);
    q2.enqueue('b', { data: 'v1' }, e2);
    await vi.advanceTimersByTimeAsync(0);
    q2.enqueue('b', { data: 'v2' }, e2);
    expect(vi.getTimerCount()).toBe(1);
    q2.clear();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(RESYNC_TIMEOUT_MS + 1000);
    expect(e2).toHaveBeenCalledTimes(1);
    q2.dispose();

    // cancel
    const q3 = createSaveQueue<TestPayload>();
    const e3 = vi.fn().mockImplementation(never);
    q3.enqueue('c', { data: 'v1' }, e3);
    await vi.advanceTimersByTimeAsync(0);
    q3.enqueue('c', { data: 'v2' }, e3);
    expect(vi.getTimerCount()).toBe(1);
    q3.cancel('c');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(RESYNC_TIMEOUT_MS + 1000);
    expect(e3).toHaveBeenCalledTimes(1);
    q3.dispose();
  });

  it('21. eviction LRU NO desaloja un entry syncing con resync pendiente → durabilidad bajo presión de cap', async () => {
    const queue = createSaveQueue<TestPayload>();
    const never = () => new Promise<void>(() => {});

    // 'a': syncing con resync armado (in-flight offline + upsert subsiguiente). Es la
    // más vieja → sería la primera candidata a eviction de no ser por el guard
    // `status === 'syncing'` (saveQueue.ts:102).
    const aExec = vi.fn().mockImplementation(never);
    queue.enqueue('a', { data: 'v1' }, aExec);
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue('a', { data: 'v2' }, aExec);
    expect(queue.getEntry('a')?.resyncTimerId).not.toBeNull();
    expect(aExec).toHaveBeenCalledTimes(1);

    // Presión de cap: 60 entries evictables (rechazan → 'retrying', no syncing).
    // evictOldestIfFull desaloja las más viejas NO-syncing, nunca 'a'.
    const fillerExec = vi.fn().mockRejectedValue(new Error('transient'));
    for (let i = 0; i < 60; i++) {
      queue.enqueue(`filler-${i}`, { data: `f${i}` }, fillerExec);
      await vi.advanceTimersByTimeAsync(0);
    }

    // La presión de cap fue real: el filler más viejo (no-syncing) sí fue desalojado.
    // Sin esto, un cap > 60 dejaría pasar el test sin forzar ningún desalojo (falso verde).
    expect(queue.getEntry('filler-0')).toBeUndefined();

    // 'a' sobrevivió la presión de cap con su resync intacto.
    expect(queue.getEntry('a')).toBeDefined();
    expect(queue.getEntry('a')?.status).toBe('syncing');
    expect(queue.getEntry('a')?.resyncTimerId).not.toBeNull();

    // y el resync sigue funcional: al cumplirse N re-dispara v2 (durabilidad intacta).
    await vi.advanceTimersByTimeAsync(RESYNC_TIMEOUT_MS);
    expect(aExec).toHaveBeenCalledTimes(2);
    expect(aExec).toHaveBeenNthCalledWith(2, { data: 'v2' });

    queue.dispose();
  });
});
