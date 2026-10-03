// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { notesStore } from '@/stores/notesStore';
import useSimilarNotes from '@/hooks/useSimilarNotes';

vi.mock('@/hooks/useAuth', () => ({ default: () => ({ user: { uid: 'u1' } }) }));
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

describe('useSimilarNotes', () => {
  beforeEach(() => {
    notesStore.delTables();
    notesStore.setRow('notes', 'viva', { title: 'Viva', isArchived: false, deletedAt: 0 });
    notesStore.setRow('notes', 'papelera', {
      title: 'Papelera',
      isArchived: false,
      deletedAt: 1_700_000_000_000,
    });
    notesStore.setRow('notes', 'archivada', { title: 'Archivada', isArchived: true });
    notesStore.setRow('notes', 'actual', { title: 'Actual' });
  });

  it('excluye papelera, archivadas y notas purgadas (sin row)', async () => {
    const { result } = renderHook(() => useSimilarNotes('actual'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notes.map((n) => n.noteId)).toEqual(['viva']);
  });
});
