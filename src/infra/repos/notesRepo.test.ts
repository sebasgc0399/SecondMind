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

  describe('auth guard', () => {
    it('throws cuando auth.currentUser es null en toggleFavorite', async () => {
      const firebase = await import('@/lib/firebase');
      (firebase.auth as { currentUser: { uid: string } | null }).currentUser = null;
      notesStore.setRow('notes', 'n6', { isFavorite: false });
      await expect(notesRepo.toggleFavorite('n6')).rejects.toThrow(/uid/i);
    });
  });
});
