// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { notesStore } from '@/stores/notesStore';
import useSimilarNotes from '@/hooks/useSimilarNotes';

// `user` estable entre renders: es dependencia del efecto del hook; un objeto nuevo
// por render dispararía un bucle de recomputes.
const { USER } = vi.hoisted(() => ({ USER: { uid: 'u1' } }));
vi.mock('@/hooks/useAuth', () => ({ default: () => ({ user: USER }) }));
vi.mock('@/hooks/useSemanticConsent', () => ({
  default: () => ({ consent: { enabled: true }, isLoaded: true }),
}));
vi.mock('@/lib/embeddings', () => ({
  cosineSimilarity: (a: number[], b: number[]) => (a[0] === b[0] ? 1 : 0),
  fetchEmbedding: vi.fn(async () => [1]),
  getEmbeddingsCache: vi.fn(
    async () =>
      new Map<string, number[]>([
        ['viva', [1]],
        ['papelera', [1]],
        ['archivada', [1]],
        ['purgada', [1]],
        ['actual', [1]],
      ]),
  ),
  updateEmbeddingInCache: vi.fn(),
}));

const TRASHED = 1_700_000_000_000;

describe('useSimilarNotes', () => {
  beforeEach(() => {
    notesStore.delTables();
    notesStore.setRow('notes', 'viva', { title: 'Viva', isArchived: false, deletedAt: 0 });
    notesStore.setRow('notes', 'papelera', {
      title: 'Papelera',
      isArchived: false,
      deletedAt: TRASHED,
    });
    notesStore.setRow('notes', 'archivada', { title: 'Archivada', isArchived: true });
    notesStore.setRow('notes', 'actual', { title: 'Actual' });
  });

  it('excluye papelera, archivadas y notas purgadas (sin row)', async () => {
    const { result } = renderHook(() => useSimilarNotes('actual'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notes.map((n) => n.noteId)).toEqual(['viva']);
  });

  it('una nota similar que pasa a la papelera después de cargar desaparece', async () => {
    const { result } = renderHook(() => useSimilarNotes('actual'));
    await waitFor(() => expect(result.current.notes.map((n) => n.noteId)).toEqual(['viva']));
    act(() => {
      notesStore.setCell('notes', 'viva', 'deletedAt', TRASHED);
    });
    expect(result.current.notes).toEqual([]);
  });

  it('una nota restaurada o cuya row aparece después de calcular se muestra', async () => {
    const { result } = renderHook(() => useSimilarNotes('actual'));
    await waitFor(() => expect(result.current.notes.map((n) => n.noteId)).toEqual(['viva']));
    act(() => {
      notesStore.setCell('notes', 'papelera', 'deletedAt', 0);
      notesStore.setRow('notes', 'purgada', { title: 'Purgada', deletedAt: 0 });
    });
    expect(result.current.notes.map((n) => n.noteId).sort()).toEqual([
      'papelera',
      'purgada',
      'viva',
    ]);
  });
});
