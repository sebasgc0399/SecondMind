import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'tinybase';
import { createFirestoreRepo, type RepoRow } from '@/infra/repos/baseRepo';

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

  it('auth.currentUser null → throw con mensaje claro en create/update/remove', async () => {
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
  });
});
