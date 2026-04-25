import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notesRepo } from '@/infra/repos/notesRepo';
import { notesStore } from '@/stores/notesStore';

// vi.mock se hoistea al top por Vitest — el factory se evalúa ANTES que
// los imports de arriba, así que el orden físico no importa. El store se
// crea dentro del factory porque las top-level vars del test todavía no
// existen cuando vi.mock corre.
vi.mock('@/stores/notesStore', async () => {
  const { createStore } = await import('tinybase');
  const store = createStore().setTablesSchema({
    notes: {
      isFavorite: { type: 'boolean', default: false },
      deletedAt: { type: 'number', default: 0 },
      updatedAt: { type: 'number', default: 0 },
      title: { type: 'string', default: '' },
    },
  });
  return { notesStore: store };
});

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } as { uid: string } | null },
  db: {} as object,
}));

const setDocMock = vi.fn();
const deleteDocMock = vi.fn();
const updateDocMock = vi.fn();
const docMock = vi.fn((_db: object, path: string) => ({ __path: path }));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
}));

describe('notesRepo', () => {
  beforeEach(async () => {
    setDocMock.mockReset();
    setDocMock.mockResolvedValue(undefined);
    deleteDocMock.mockReset();
    updateDocMock.mockReset();
    docMock.mockClear();
    notesStore.delTable('notes');
    const firebase = await import('@/lib/firebase');
    (firebase.auth as { currentUser: { uid: string } | null }).currentUser = {
      uid: 'test-uid',
    };
  });

  describe('toggleFavorite', () => {
    it('flippea false → true sync ANTES de async Firestore', async () => {
      notesStore.setRow('notes', 'n1', { isFavorite: false, title: 'x' });
      let resolveSetDoc: () => void = () => {};
      setDocMock.mockImplementation(() => new Promise<void>((r) => (resolveSetDoc = r)));

      const promise = notesRepo.toggleFavorite('n1');
      // setDoc pendiente, pero TinyBase ya refleja el flip
      expect(notesStore.getCell('notes', 'n1', 'isFavorite')).toBe(true);
      expect(setDocMock).toHaveBeenCalledOnce();

      resolveSetDoc();
      await promise;
    });

    it('flippea true → false', async () => {
      notesStore.setRow('notes', 'n2', { isFavorite: true });
      await notesRepo.toggleFavorite('n2');
      expect(notesStore.getCell('notes', 'n2', 'isFavorite')).toBe(false);
    });

    it('actualiza updatedAt al toggle', async () => {
      notesStore.setRow('notes', 'n3', { isFavorite: false, updatedAt: 1000 });
      const before = Date.now();
      await notesRepo.toggleFavorite('n3');
      const updated = notesStore.getCell('notes', 'n3', 'updatedAt') as number;
      expect(updated).toBeGreaterThanOrEqual(before);
    });
  });

  describe('softDelete', () => {
    it('setea deletedAt > 0 sync ANTES de async Firestore', async () => {
      notesStore.setRow('notes', 'n4', { deletedAt: 0, title: 'doomed' });
      let resolveSetDoc: () => void = () => {};
      setDocMock.mockImplementation(() => new Promise<void>((r) => (resolveSetDoc = r)));

      const before = Date.now();
      const promise = notesRepo.softDelete('n4');

      const ts = notesStore.getCell('notes', 'n4', 'deletedAt') as number;
      expect(ts).toBeGreaterThanOrEqual(before);
      // La nota sigue en el store — no es hard delete
      expect(notesStore.getRow('notes', 'n4').title).toBe('doomed');
      expect(setDocMock).toHaveBeenCalledOnce();

      resolveSetDoc();
      await promise;
    });
  });

  describe('restore', () => {
    it('limpia deletedAt a 0', async () => {
      notesStore.setRow('notes', 'n5', { deletedAt: 99999, title: 'restorable' });
      await notesRepo.restore('n5');
      expect(notesStore.getCell('notes', 'n5', 'deletedAt')).toBe(0);
      expect(notesStore.getRow('notes', 'n5').title).toBe('restorable');
    });
  });

  describe('hardDelete', () => {
    it('borra row sync ANTES de await deleteDoc (patrón canónico sync→async)', async () => {
      notesStore.setRow('notes', 'n7', { title: 'gone', deletedAt: 99999 });
      let resolveDelete: () => void = () => {};
      deleteDocMock.mockImplementation(() => new Promise<void>((r) => (resolveDelete = r)));

      const promise = notesRepo.hardDelete('n7');

      // delRow ya corrió: la row no existe en el store
      expect(notesStore.getRow('notes', 'n7')).toEqual({});
      // deleteDoc fue llamado al path correcto
      expect(deleteDocMock).toHaveBeenCalledOnce();
      expect(docMock).toHaveBeenCalledWith({}, 'users/test-uid/notes/n7');

      resolveDelete();
      await promise;
    });
  });

  describe('purgeAll', () => {
    it('array vacío es no-op (no toca Firestore)', async () => {
      await notesRepo.purgeAll([]);
      expect(deleteDocMock).not.toHaveBeenCalled();
    });

    it('borra N notas en paralelo dentro del chunk', async () => {
      notesStore.setRow('notes', 'a', { title: 'a' });
      notesStore.setRow('notes', 'b', { title: 'b' });
      notesStore.setRow('notes', 'c', { title: 'c' });
      deleteDocMock.mockResolvedValue(undefined);

      await notesRepo.purgeAll(['a', 'b', 'c']);

      expect(deleteDocMock).toHaveBeenCalledTimes(3);
      expect(notesStore.getRow('notes', 'a')).toEqual({});
      expect(notesStore.getRow('notes', 'b')).toEqual({});
      expect(notesStore.getRow('notes', 'c')).toEqual({});
    });

    it('Promise.allSettled: un fallo no aborta los otros', async () => {
      notesStore.setRow('notes', 'ok1', { title: 'ok1' });
      notesStore.setRow('notes', 'fail', { title: 'fail' });
      notesStore.setRow('notes', 'ok2', { title: 'ok2' });
      // Mock: el segundo deleteDoc rechaza, los otros resuelven
      deleteDocMock.mockImplementation((ref: { __path: string }) =>
        ref.__path.endsWith('/fail') ? Promise.reject(new Error('boom')) : Promise.resolve(),
      );
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await notesRepo.purgeAll(['ok1', 'fail', 'ok2']);

      expect(deleteDocMock).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledOnce();
      errorSpy.mockRestore();
    });

    it('chunkea en lotes de 50 (75 ids → 2 chunks)', async () => {
      const ids = Array.from({ length: 75 }, (_, i) => `n${i}`);
      ids.forEach((id) => notesStore.setRow('notes', id, { title: id }));
      deleteDocMock.mockResolvedValue(undefined);

      await notesRepo.purgeAll(ids);

      expect(deleteDocMock).toHaveBeenCalledTimes(75);
      expect(notesStore.getRow('notes', 'n0')).toEqual({});
      expect(notesStore.getRow('notes', 'n74')).toEqual({});
    });
  });

  describe('auth guard', () => {
    it('throws cuando auth.currentUser es null en toggleFavorite', async () => {
      const firebase = await import('@/lib/firebase');
      (firebase.auth as { currentUser: { uid: string } | null }).currentUser = null;
      notesStore.setRow('notes', 'n6', { isFavorite: false });
      await expect(notesRepo.toggleFavorite('n6')).rejects.toThrow(/uid/i);
    });

    it('throws cuando auth.currentUser es null en hardDelete', async () => {
      const firebase = await import('@/lib/firebase');
      (firebase.auth as { currentUser: { uid: string } | null }).currentUser = null;
      notesStore.setRow('notes', 'n8', { title: 'x' });
      await expect(notesRepo.hardDelete('n8')).rejects.toThrow(/uid/i);
    });
  });
});
