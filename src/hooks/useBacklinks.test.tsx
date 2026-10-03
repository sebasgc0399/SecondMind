// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'tinybase/ui-react';
import { createStore } from 'tinybase';
import useBacklinks from '@/hooks/useBacklinks';

const TRASHED = 1_700_000_000_000;

function setup(notes: Record<string, Record<string, string | number | boolean>>) {
  const notesStore = createStore().setTable('notes', notes);
  const linksStore = createStore().setTable('links', {
    'a__t': { sourceId: 'a', targetId: 't', sourceTitle: 'A', context: 'ctx' },
    'ghost__t': { sourceId: 'ghost', targetId: 't', sourceTitle: 'Ghost', context: '' },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={notesStore} storesById={{ links: linksStore }}>
      {children}
    </Provider>
  );
  return { notesStore, ...renderHook(() => useBacklinks('t'), { wrapper }) };
}

describe('useBacklinks', () => {
  it('muestra el backlink de un origen vivo', () => {
    const { result } = setup({ a: { title: 'A', deletedAt: 0 }, t: { title: 'T' } });
    expect(result.current.map((b) => b.sourceId)).toEqual(['a']);
  });

  it('no muestra backlinks de un origen en la papelera', () => {
    const { result } = setup({ a: { title: 'A', deletedAt: TRASHED }, t: { title: 'T' } });
    expect(result.current).toEqual([]);
  });

  it('no muestra backlinks de un origen inexistente en notes', () => {
    const { result } = setup({ t: { title: 'T' } });
    expect(result.current).toEqual([]);
  });

  it('restaurar el origen hace reaparecer el backlink', () => {
    const { result, notesStore } = setup({
      a: { title: 'A', deletedAt: TRASHED },
      t: { title: 'T' },
    });
    expect(result.current).toEqual([]);
    act(() => {
      notesStore.setCell('notes', 'a', 'deletedAt', 0);
    });
    expect(result.current.map((b) => b.sourceId)).toEqual(['a']);
  });
});
