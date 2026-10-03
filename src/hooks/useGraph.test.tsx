// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'tinybase/ui-react';
import { createStore } from 'tinybase';
import useGraph from '@/hooks/useGraph';

vi.mock('@/hooks/useTheme', () => ({
  default: () => ({ resolvedTheme: 'light' }),
}));

describe('useGraph', () => {
  it('excluye del grafo las notas en la papelera y sus aristas', () => {
    const store = createStore().setTable('notes', {
      a: { title: 'A', isArchived: false, deletedAt: 0 },
      b: { title: 'B', isArchived: false },
      c: { title: 'C', isArchived: false, deletedAt: 0 },
      papelera: { title: 'Papelera', isArchived: false, deletedAt: 1_700_000_000_000 },
    });
    const links = createStore().setTable('links', {
      ab: { sourceId: 'a', targetId: 'b' },
      ap: { sourceId: 'a', targetId: 'papelera' },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store} storesById={{ links }}>
        {children}
      </Provider>
    );
    const { result } = renderHook(() => useGraph(), { wrapper });
    expect(result.current.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(result.current.edges.map((e) => e.id)).toEqual(['ab']);
  });
});
