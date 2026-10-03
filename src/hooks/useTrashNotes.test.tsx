// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'tinybase/ui-react';
import { createStore } from 'tinybase';
import useTrashNotes from '@/hooks/useTrashNotes';
import { DEFAULT_PREFERENCES } from '@/types/preferences';

vi.mock('@/hooks/useStoreHydration', () => ({
  useStoreHydration: () => ({ isHydrating: false }),
}));
vi.mock('@/hooks/usePreferences', () => ({
  default: () => ({ preferences: DEFAULT_PREFERENCES, isLoaded: true }),
}));

describe('useTrashNotes', () => {
  it('lista solo las notas en la papelera (deletedAt > 0), la más reciente primero', () => {
    const store = createStore().setTable('notes', {
      viva: { title: 'Viva', deletedAt: 0 },
      legacy: { title: 'Sin deletedAt' },
      vieja: { title: 'Vieja', deletedAt: 1_700_000_000_000 },
      nueva: { title: 'Nueva', deletedAt: 1_700_000_500_000 },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(() => useTrashNotes(), { wrapper });
    expect(result.current.notes.map((n) => n.id)).toEqual(['nueva', 'vieja']);
    expect(result.current.count).toBe(2);
    expect(result.current.allIds.sort()).toEqual(['nueva', 'vieja']);
  });
});
