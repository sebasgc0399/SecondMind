// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import useGlobalSearch from '@/hooks/useGlobalSearch';
import { notesStore } from '@/stores/notesStore';

describe('useGlobalSearch', () => {
  it('no devuelve notas en la papelera (ni en recientes ni en búsqueda)', () => {
    notesStore.setTable('notes', {
      viva: { title: 'Zorro viva', updatedAt: 2 },
      papelera: { title: 'Zorro papelera', updatedAt: 3, deletedAt: 1_700_000_000_000 },
    });
    const recents = renderHook(() => useGlobalSearch(''));
    expect(recents.result.current.map((r) => r.id)).toEqual(['viva']);
    const found = renderHook(() => useGlobalSearch('Zorro'));
    expect(found.result.current.map((r) => r.id)).toEqual(['viva']);
  });
});
