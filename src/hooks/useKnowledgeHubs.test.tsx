// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'tinybase/ui-react';
import { createStore } from 'tinybase';
import useKnowledgeHubs from '@/hooks/useKnowledgeHubs';

vi.mock('@/hooks/useStoreHydration', () => ({
  useStoreHydration: () => ({ isHydrating: false }),
}));

function renderWithNotes(notes: Record<string, Record<string, string | number | boolean>>) {
  const store = createStore().setTable('notes', notes);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(() => useKnowledgeHubs(), { wrapper });
}

describe('useKnowledgeHubs', () => {
  it('excluye las notas en la papelera (deletedAt > 0)', () => {
    const { result } = renderWithNotes({
      vivo: { title: 'Hub vivo', linkCount: 4, isArchived: false, deletedAt: 0 },
      papelera: {
        title: 'Hub en papelera',
        linkCount: 5,
        isArchived: false,
        deletedAt: 1_700_000_000_000,
      },
      chico: { title: 'Pocos links', linkCount: 1, isArchived: false, deletedAt: 0 },
    });
    expect(result.current.items.map((h) => h.noteId)).toEqual(['vivo']);
  });

  it('una nota sin deletedAt cuenta como no borrada', () => {
    const { result } = renderWithNotes({ legacy: { title: 'Legacy', linkCount: 3 } });
    expect(result.current.items.map((h) => h.noteId)).toEqual(['legacy']);
  });
});
