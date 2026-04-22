import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'tinybase';

vi.mock('@/lib/firebase', () => ({
  db: {} as object,
  auth: { currentUser: { uid: 'test-uid' } as { uid: string } | null },
}));

const setDocMock = vi.fn();
const deleteDocMock = vi.fn();
const getDocsMock = vi.fn();
const onSnapshotMock = vi.fn();
const docMock = vi.fn((_db: object, path: string) => ({ __path: path }));
const collectionMock = vi.fn((_db: object, path: string) => ({ __collectionPath: path }));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
  collection: (...args: unknown[]) => collectionMock(args[0] as object, args[1] as string),
}));

import { createFirestorePersister } from '@/lib/tinybase';

interface TestRow {
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

function makeQuerySnapshot(rows: Record<string, TestRow>) {
  return {
    forEach: (cb: (docSnap: { id: string; data: () => TestRow }) => void) => {
      Object.entries(rows).forEach(([id, data]) => cb({ id, data: () => data }));
    },
  };
}

// Esperar a que TinyBase resuelva el setPersisted async pendiente. Varios
// microtasks porque el callback hace await Promise.allSettled + reportar.
async function flushPersist() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

async function makeReadyPersister(initialDocs: Record<string, TestRow> = {}) {
  getDocsMock.mockResolvedValueOnce(makeQuerySnapshot(initialDocs));
  const store = makeStore();
  const persister = createFirestorePersister({
    store,
    collectionPath: 'users/test-uid/items',
    tableName: 'items',
  });
  await persister.startAutoLoad();
  await persister.startAutoSave();
  await flushPersist();
  // Limpiar mocks tras hidratación para que asserts solo midan acciones del test.
  setDocMock.mockClear();
  deleteDocMock.mockClear();
  return { store, persister };
}

describe('createFirestorePersister (diff-based)', () => {
  beforeEach(() => {
    setDocMock.mockReset();
    deleteDocMock.mockReset();
    getDocsMock.mockReset();
    onSnapshotMock.mockReset();
    docMock.mockClear();
    collectionMock.mockClear();
    setDocMock.mockResolvedValue(undefined);
    deleteDocMock.mockResolvedValue(undefined);
    getDocsMock.mockResolvedValue(makeQuerySnapshot({}));
    onSnapshotMock.mockReturnValue(() => {}); // unsubscribe noop
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1: startAutoLoad con N rows + tick siguiente sin cambios → 0 writes', async () => {
    await makeReadyPersister({
      'row-1': { name: 'a', count: 1 },
      'row-2': { name: 'b', count: 2 },
      'row-3': { name: 'c', count: 3 },
    });
    // makeReadyPersister ya hizo flushPersist + clearMocks.
    // El primer setPersisted post-load llega con changes === undefined → skip,
    // por eso ya no hay invocaciones cuando volvemos acá.
    expect(setDocMock).not.toHaveBeenCalled();
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('Test 2: store.setRow row nueva → 1 setDoc con merge:true', async () => {
    const { store } = await makeReadyPersister();

    store.setRow('items', 'row-1', { name: 'new', count: 1 });
    await flushPersist();

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ __path: 'row-1' }),
      { name: 'new', count: 1 },
      { merge: true },
    );
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('Test 3: store.setPartialRow modifica un cell → 1 setDoc con el row entero', async () => {
    const { store } = await makeReadyPersister({
      'row-1': { name: 'old', count: 5 },
    });

    store.setPartialRow('items', 'row-1', { count: 10 });
    await flushPersist();

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ __path: 'row-1' }),
      { name: 'old', count: 10 },
      { merge: true },
    );
  });

  it('Test 4: store.delRow NO dispara deleteDoc (limitación TinyBase v8)', async () => {
    // TinyBase v8 NO reporta los IDs eliminados en `changes` — delRow standalone
    // produce `changes = [{}, {}, 1]` (vacío). Por eso el persister no puede
    // emitir deleteDoc. En producción esto es inocuo: tasksRepo.remove() hace
    // su propio deleteDoc directo, el persister no necesita propagarlo.
    // Si alguien llama store.delRow sin pasar por un repo, el doc queda
    // huérfano en Firestore (gotcha pre-existente, F12 no lo cambia).
    const { store } = await makeReadyPersister({
      'row-1': { name: 'doomed', count: 0 },
    });

    store.delRow('items', 'row-1');
    await flushPersist();

    expect(deleteDocMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('Test 5: transacción con 3 setRow → 3 setDocs en mismo Promise.allSettled', async () => {
    const { store } = await makeReadyPersister();

    store.transaction(() => {
      store.setRow('items', 'row-1', { name: 'a', count: 1 });
      store.setRow('items', 'row-2', { name: 'b', count: 2 });
      store.setRow('items', 'row-3', { name: 'c', count: 3 });
    });
    await flushPersist();

    expect(setDocMock).toHaveBeenCalledTimes(3);
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('Test 6: 1 add + 1 modify + 1 delete simultáneos → 2 setDocs (delete ignorado)', async () => {
    // Por la misma limitación de Test 4: `changes` solo trae los rows
    // add/modify ('add-me', 'modify-me'), no 'delete-me'. El persister emite
    // 2 setDocs y 0 deleteDocs. El delete real lo haría tasksRepo.remove
    // en producción, no este path.
    const { store } = await makeReadyPersister({
      'modify-me': { name: 'initial', count: 1 },
      'delete-me': { name: 'doomed', count: 0 },
    });

    store.transaction(() => {
      store.setRow('items', 'add-me', { name: 'new', count: 99 });
      store.setPartialRow('items', 'modify-me', { count: 42 });
      store.delRow('items', 'delete-me');
    });
    await flushPersist();

    expect(setDocMock).toHaveBeenCalledTimes(2);
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('Test 7: setDoc falla para 1 de 3 → otros 2 completan, no hay retry automático', async () => {
    const { store } = await makeReadyPersister();

    setDocMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(undefined);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    store.transaction(() => {
      store.setRow('items', 'row-1', { name: 'a', count: 1 });
      store.setRow('items', 'row-2', { name: 'b', count: 2 });
      store.setRow('items', 'row-3', { name: 'c', count: 3 });
    });
    await flushPersist();

    // Promise.allSettled no aborta — los 3 setDocs se invocan.
    expect(setDocMock).toHaveBeenCalledTimes(3);
    // Error reportado al console (filtrado isSilentError lo deja pasar porque
    // Error genérico no tiene `code`).
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('write failed'),
      expect.objectContaining({ message: 'quota exceeded' }),
    );

    // Siguiente cambio NO re-escribe automáticamente la row fallida.
    setDocMock.mockClear();
    setDocMock.mockResolvedValue(undefined);
    consoleErrorSpy.mockClear();

    store.setRow('items', 'row-4', { name: 'd', count: 4 });
    await flushPersist();

    // Solo row-4 (TinyBase no reintenta row-2 — eventual consistency cuando
    // la row vuelva a tocarse).
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ __path: 'row-4' }),
      expect.anything(),
      expect.anything(),
    );

    consoleErrorSpy.mockRestore();
  });

  it('Test 8: store.delTable NO dispara writes (limitación TinyBase v8)', async () => {
    // delTable produce `changes = [{}, {}, 1]` (vacío) o `[{items: {}}, {}, 1]`
    // — TinyBase no enumera los rows borrados. El persister no puede emitir
    // deleteDocs masivos. Path inocuo para F11: el cleanup de useStoreInit
    // hace destroy() ANTES de delTable, así que el persister ya está apagado.
    // Si el orden se invierte por accidente, F12 igual no borra Firestore
    // (más seguro que pre-F12 donde sí borraría).
    const { store } = await makeReadyPersister({
      'row-1': { name: 'a', count: 1 },
      'row-2': { name: 'b', count: 2 },
    });

    store.delTable('items');
    await flushPersist();

    expect(setDocMock).not.toHaveBeenCalled();
    expect(deleteDocMock).not.toHaveBeenCalled();
  });
});
