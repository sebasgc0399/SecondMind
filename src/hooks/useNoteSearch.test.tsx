// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useNoteSearch from '@/hooks/useNoteSearch';
import { notesStore } from '@/stores/notesStore';

describe('useNoteSearch', () => {
  beforeEach(() => {
    notesStore.delTables();
    notesStore.setTable('notes', {
      viva: { title: 'Zorro viva', updatedAt: 2 },
      papelera: { title: 'Zorro papelera', updatedAt: 3, deletedAt: 1_700_000_000_000 },
    });
  });

  it('sin query no lista notas en la papelera', () => {
    const { result } = renderHook(() => useNoteSearch());
    expect(result.current.results.map((r) => r.id)).toEqual(['viva']);
  });

  it('con query no devuelve notas en la papelera', () => {
    const { result } = renderHook(() => useNoteSearch());
    act(() => result.current.setQuery('Zorro'));
    expect(result.current.results.map((r) => r.id)).toEqual(['viva']);
  });
});
