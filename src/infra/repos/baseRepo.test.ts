import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'tinybase';
import { createFirestoreRepo, type RepoRow } from '@/infra/repos/baseRepo';
import { createSaveQueue } from '@/lib/saveQueue';

// Mock de @/lib/firebase — auth.currentUser mutable para cada test.
vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } as { uid: string } | null },
  db: {} as object,
}));

// Mock de firebase/firestore — stubs que el factory llama.
const setDocMock = vi.fn();
const deleteDocMock = vi.fn();
const docMock = vi.fn((_db: object, path: string) => ({ __path: path }));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
}));

interface TestRow extends RepoRow {
  name: string;
  count: number;
}

function makeStore() {
  return createStore().setTablesSchema({
    items: {
      name: { type: 'string', default: '' },
      count: { type: 'number', default: 0 },
    },
  });
}

describe('createFirestoreRepo', () => {
  beforeEach(async () => {
    setDocMock.mockReset();
    deleteDocMock.mockReset();
    docMock.mockClear();
    const firebase = await import('@/lib/firebase');
    (firebase.auth as { currentUser: { uid: string } | null }).currentUser = { uid: 'test-uid' };
  });

  it('create respeta orden sync → async (setRow antes que setDoc resuelva)', async () => {
    const store = makeStore();
    let resolveSetDoc: () => void = () => {};
    setDocMock.mockImplementation(() => new Promise<void>((r) => (resolveSetDoc = r)));

    const repo = createFirestoreRepo<TestRow>({
      store,
      table: 'items',
      pathFor: (uid, id) => `users/${uid}/items/${id}`,
    });

    const promise = repo.create({ name: 'hello', count: 1 }, { id: 'row-a' });
    // setDoc sigue pending, pero setRow ya ocurrió sincrónicamente
    expect(store.getRow('items', 'row-a')).toEqual({ name: 'hello', count: 1 });
    expect(setDocMock).toHaveBeenCalledOnce();

    resolveSetDoc();
    const returnedId = await promise;
    expect(returnedId).toBe('row-a');
  });

  it('update respeta orden sync → async (setPartialRow antes que setDoc resuelva)', async () => {
    const store = makeStore();
    store.setRow('items', 'row-b', { name: 'old', count: 5 });

    let resolveSetDoc: () => void = () => {};
    setDocMock.mockImplementation(() => new Promise<void>((r) => (resolveSetDoc = r)));

    const repo = createFirestoreRepo<TestRow>({
      store,
      table: 'items',
      pathFor: (uid, id) => `users/${uid}/items/${id}`,
    });

    const promise = repo.update('row-b', { count: 10 });
    // setDoc sigue pending, pero setPartialRow ya mergeó
    expect(store.getRow('items', 'row-b')).toEqual({ name: 'old', count: 10 });

    resolveSetDoc();
    await promise;
  });

  it('create con id provisto lo usa; sin id genera UUID v4', async () => {
    const store = makeStore();
    setDocMock.mockResolvedValue(undefined);

    const repo = createFirestoreRepo<TestRow>({
      store,
      table: 'items',
      pathFor: (uid, id) => `users/${uid}/items/${id}`,
    });

    const withId = await repo.create({ name: 'a', count: 1 }, { id: 'custom-id' });
    expect(withId).toBe('custom-id');

    const withoutId = await repo.create({ name: 'b', count: 2 });
    expect(withoutId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('remove llama delRow sync antes de deleteDoc async', async () => {
    const store = makeStore();
    store.setRow('items', 'row-c', { name: 'doomed', count: 0 });

    let resolveDeleteDoc: () => void = () => {};
    deleteDocMock.mockImplementation(() => new Promise<void>((r) => (resolveDeleteDoc = r)));

    const repo = createFirestoreRepo<TestRow>({
      store,
      table: 'items',
      pathFor: (uid, id) => `users/${uid}/items/${id}`,
    });

    const promise = repo.remove('row-c');
    // deleteDoc pending, pero delRow ya ocurrió
    expect(store.getRow('items', 'row-c')).toEqual({});
    expect(deleteDocMock).toHaveBeenCalledOnce();

    resolveDeleteDoc();
    await promise;
  });

  it('create preserva campos no-en-schema en setDoc (no los pierde por mutación de setRow)', async () => {
    const store = makeStore();
    setDocMock.mockResolvedValue(undefined);

    const repo = createFirestoreRepo<TestRow>({
      store,
      table: 'items',
      pathFor: (uid, id) => `users/${uid}/items/${id}`,
    });

    type RowWithExtra = TestRow & { extraField: string };
    await repo.create({ name: 'hi', count: 1, extraField: 'persisted' } as RowWithExtra, {
      id: 'row-extra',
    });

    // TinyBase ignora extraField (no en schema { name, count })
    expect(store.getRow('items', 'row-extra')).toEqual({ name: 'hi', count: 1 });
    // Firestore lo recibe íntegro porque dataForFirestore es shallow copy pre-setRow
    const setDocPayload = setDocMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(setDocPayload).toEqual({ name: 'hi', count: 1, extraField: 'persisted' });
  });

  it('update preserva campos no-en-schema en setDoc (mismo gotcha que create)', async () => {
    const store = makeStore();
    store.setRow('items', 'row-upd', { name: 'old', count: 5 });
    setDocMock.mockResolvedValue(undefined);

    const repo = createFirestoreRepo<TestRow>({
      store,
      table: 'items',
      pathFor: (uid, id) => `users/${uid}/items/${id}`,
    });

    type PartialWithExtra = Partial<TestRow> & { extraField: string };
    await repo.update('row-upd', { count: 10, extraField: 'persisted' } as PartialWithExtra);

    // TinyBase aplicó count, ignoró extraField
    expect(store.getRow('items', 'row-upd')).toEqual({ name: 'old', count: 10 });
    // Firestore recibe ambos campos
    const setDocPayload = setDocMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(setDocPayload).toEqual({ count: 10, extraField: 'persisted' });
  });

  it('auth.currentUser null → throw con mensaje claro en create/update/remove/removeRaw', async () => {
    const firebase = await import('@/lib/firebase');
    (firebase.auth as { currentUser: { uid: string } | null }).currentUser = null;

    const store = makeStore();
    const repo = createFirestoreRepo<TestRow>({
      store,
      table: 'items',
      pathFor: (uid, id) => `users/${uid}/items/${id}`,
    });

    await expect(repo.create({ name: 'x', count: 1 })).rejects.toThrow(/uid/i);
    await expect(repo.update('any-id', { count: 2 })).rejects.toThrow(/uid/i);
    await expect(repo.remove('any-id')).rejects.toThrow(/uid/i);
    await expect(repo.removeRaw('any-id')).rejects.toThrow(/uid/i);
  });

  describe('createFirestoreRepo con queue', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('update con queue → enqueue + executor llama setDoc tras microtask', async () => {
      const store = makeStore();
      store.setRow('items', 'q1', { name: 'old', count: 1 });
      setDocMock.mockResolvedValue(undefined);
      const queue = createSaveQueue<Partial<TestRow>>();

      const repo = createFirestoreRepo<TestRow>({
        store,
        table: 'items',
        pathFor: (uid, id) => `users/${uid}/items/${id}`,
        queue,
      });

      await repo.update('q1', { count: 5 });

      // TinyBase ya aplicó el partial sync.
      expect(store.getRow('items', 'q1')).toEqual({ name: 'old', count: 5 });

      await vi.advanceTimersByTimeAsync(200);

      expect(setDocMock).toHaveBeenCalledOnce();
      const payload = setDocMock.mock.calls[0]![1] as Record<string, unknown>;
      expect(payload).toEqual({ count: 5 });

      queue.dispose();
    });

    it('remove con queue → enqueue + executor llama deleteDoc tras microtask', async () => {
      const store = makeStore();
      store.setRow('items', 'r1', { name: 'doomed', count: 0 });
      deleteDocMock.mockResolvedValue(undefined);
      const queue = createSaveQueue<Partial<TestRow>>();

      const repo = createFirestoreRepo<TestRow>({
        store,
        table: 'items',
        pathFor: (uid, id) => `users/${uid}/items/${id}`,
        queue,
      });

      await repo.remove('r1');

      // delRow sync.
      expect(store.getRow('items', 'r1')).toEqual({});

      await vi.advanceTimersByTimeAsync(200);
      expect(deleteDocMock).toHaveBeenCalledOnce();

      queue.dispose();
    });

    it('removeRaw bypassa queue: deleteDoc directo, sin enqueue', async () => {
      const store = makeStore();
      store.setRow('items', 'raw1', { name: 'bulk', count: 0 });
      deleteDocMock.mockResolvedValue(undefined);
      const queue = createSaveQueue<Partial<TestRow>>();

      const repo = createFirestoreRepo<TestRow>({
        store,
        table: 'items',
        pathFor: (uid, id) => `users/${uid}/items/${id}`,
        queue,
      });

      await repo.removeRaw('raw1');

      expect(store.getRow('items', 'raw1')).toEqual({});
      expect(deleteDocMock).toHaveBeenCalledOnce();
      // Queue intacto.
      expect(queue.getSnapshot().size).toBe(0);

      queue.dispose();
    });

    it('update con queue + uid distinto en retry → executor throws stale-write', async () => {
      const store = makeStore();
      store.setRow('items', 's1', { name: 'a', count: 1 });
      setDocMock.mockRejectedValue(new Error('transient'));
      const queue = createSaveQueue<Partial<TestRow>>();

      const repo = createFirestoreRepo<TestRow>({
        store,
        table: 'items',
        pathFor: (uid, id) => `users/${uid}/items/${id}`,
        queue,
      });

      await repo.update('s1', { count: 2 });
      await vi.advanceTimersByTimeAsync(0);
      // Primer attempt llamó setDoc (rechazó con transient).
      expect(setDocMock).toHaveBeenCalledTimes(1);
      expect(queue.getEntry('s1')?.status).toBe('retrying');

      // Cambio de uid mid-retry.
      const firebase = await import('@/lib/firebase');
      (firebase.auth as { currentUser: { uid: string } | null }).currentUser = {
        uid: 'other-uid',
      };

      // Próximos retries (1s, 2s, 4s): el executor recheca uid → throw
      // genérico (no FirebaseError → no permanente). attempts: 2, 3, 4 → 'error'.
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      // setDoc NO se llamó más allá del primer attempt: el executor abortó
      // antes de tocar setDoc en cada retry post-cambio de uid.
      expect(setDocMock).toHaveBeenCalledTimes(1);
      expect(queue.getEntry('s1')?.status).toBe('error');
      expect(queue.getEntry('s1')?.lastError?.message).toMatch(/stale write/i);

      queue.dispose();
    });

    it('F30: create con createsQueue → retorna id sync, setDoc(merge:true) flushea después', async () => {
      const store = makeStore();
      // setDoc pendiente: el create no debe esperar a que resuelva.
      let resolveSetDoc: () => void = () => {};
      setDocMock.mockImplementation(() => new Promise<void>((r) => (resolveSetDoc = r)));
      const createsQueue = createSaveQueue<TestRow>();

      const repo = createFirestoreRepo<TestRow>({
        store,
        table: 'items',
        pathFor: (uid, id) => `users/${uid}/items/${id}`,
        createsQueue,
      });

      const id = await repo.create({ name: 'fresh', count: 7 }, { id: 'create-q1' });

      // El id retorna inmediatamente aunque setDoc siga pending.
      expect(id).toBe('create-q1');
      // setRow ya aplicó sync.
      expect(store.getRow('items', 'create-q1')).toEqual({ name: 'fresh', count: 7 });
      // El executor del queue ya invocó setDoc — está awaiting su resolución.
      expect(setDocMock).toHaveBeenCalledOnce();
      expect(createsQueue.getEntry('create-q1')?.status).toBe('syncing');

      // Resolución del setDoc → status synced → GC tras 100ms.
      resolveSetDoc();
      await vi.advanceTimersByTimeAsync(200);

      expect(setDocMock).toHaveBeenCalledWith(
        expect.objectContaining({ __path: 'users/test-uid/items/create-q1' }),
        { name: 'fresh', count: 7 },
        { merge: true },
      );
      expect(createsQueue.getEntry('create-q1')).toBeUndefined();

      createsQueue.dispose();
    });

    it('F30: create con createsQueue + uid distinto en retry → executor throws stale-write', async () => {
      const store = makeStore();
      setDocMock.mockRejectedValue(new Error('transient'));
      const createsQueue = createSaveQueue<TestRow>();

      const repo = createFirestoreRepo<TestRow>({
        store,
        table: 'items',
        pathFor: (uid, id) => `users/${uid}/items/${id}`,
        createsQueue,
      });

      await repo.create({ name: 'staled', count: 1 }, { id: 'create-s1' });
      await vi.advanceTimersByTimeAsync(0);
      expect(setDocMock).toHaveBeenCalledTimes(1);
      expect(createsQueue.getEntry('create-s1')?.status).toBe('retrying');

      // Cambio de uid mid-retry.
      const firebase = await import('@/lib/firebase');
      (firebase.auth as { currentUser: { uid: string } | null }).currentUser = {
        uid: 'other-uid',
      };

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      // El executor abortó cada retry antes de tocar setDoc.
      expect(setDocMock).toHaveBeenCalledTimes(1);
      expect(createsQueue.getEntry('create-s1')?.status).toBe('error');
      expect(createsQueue.getEntry('create-s1')?.lastError?.message).toMatch(/stale write/i);

      createsQueue.dispose();
    });

    it('F30: create sin createsQueue → setDoc await directo (regresión retro-compat)', async () => {
      const store = makeStore();
      setDocMock.mockResolvedValue(undefined);
      // Config sin createsQueue: comportamiento idéntico a pre-F30.
      const repo = createFirestoreRepo<TestRow>({
        store,
        table: 'items',
        pathFor: (uid, id) => `users/${uid}/items/${id}`,
      });

      const id = await repo.create({ name: 'plain', count: 1 }, { id: 'create-plain' });

      expect(id).toBe('create-plain');
      // setDoc llamado sync (sin needing advanceTimers).
      expect(setDocMock).toHaveBeenCalledOnce();
      expect(setDocMock).toHaveBeenCalledWith(
        expect.objectContaining({ __path: 'users/test-uid/items/create-plain' }),
        { name: 'plain', count: 1 },
        { merge: true },
      );
    });
  });
});
