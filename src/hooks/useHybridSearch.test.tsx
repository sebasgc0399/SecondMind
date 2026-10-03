// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { notesStore } from '@/stores/notesStore';
import useHybridSearch from '@/hooks/useHybridSearch';

const { USER } = vi.hoisted(() => ({ USER: { uid: 'u1' } }));
vi.mock('@/hooks/useAuth', () => ({ default: () => ({ user: USER }) }));
vi.mock('@/hooks/useSemanticConsent', () => ({
  default: () => ({ consent: { enabled: true }, isLoaded: true }),
}));
vi.mock('@/lib/embeddings', () => ({
  cosineSimilarity: () => 1,
  embedQueryText: vi.fn(async () => [1]),
  getEmbeddingsCache: vi.fn(
    async () =>
      new Map<string, number[]>([
        ['viva', [1]],
        ['papelera', [1]],
      ]),
  ),
}));

describe('useHybridSearch.getNoteDoc', () => {
  beforeEach(() => {
    notesStore.delTables();
    notesStore.setTable('notes', {
      viva: { title: 'Viva', updatedAt: 2 },
      papelera: { title: 'Papelera', updatedAt: 3, deletedAt: 1_700_000_000_000 },
    });
  });

  it('los resultados semánticos excluyen notas en la papelera', async () => {
    const { result } = renderHook(() => useHybridSearch());
    act(() => result.current.setQuery('consulta sin match'));
    await waitFor(() => expect(result.current.semanticResults.length).toBeGreaterThan(0), {
      timeout: 3000,
    });
    expect(result.current.semanticResults.map((r) => r.note.id)).toEqual(['viva']);
  });
});
