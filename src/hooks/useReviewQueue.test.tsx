// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'tinybase/ui-react';
import { createStore } from 'tinybase';
import useReviewQueue from '@/hooks/useReviewQueue';

vi.mock('@/hooks/useStoreHydration', () => ({
  useStoreHydration: () => ({ isHydrating: false }),
}));

function renderWithNotes(notes: Record<string, Record<string, string | number | boolean>>) {
  const store = createStore().setTable('notes', notes);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(() => useReviewQueue(), { wrapper });
}

const VENCIDA = Date.now() - 86_400_000;

describe('useReviewQueue', () => {
  it('excluye las notas en la papelera (deletedAt > 0) aunque su repaso esté vencido', () => {
    const { result } = renderWithNotes({
      viva: { title: 'Viva', fsrsDue: VENCIDA, isArchived: false, deletedAt: 0 },
      papelera: {
        title: 'En papelera',
        fsrsDue: VENCIDA,
        isArchived: false,
        deletedAt: 1_700_000_000_000,
      },
      futura: { title: 'Futura', fsrsDue: Date.now() + 7 * 86_400_000, deletedAt: 0 },
    });
    expect(result.current.items.map((n) => n.id)).toEqual(['viva']);
    expect(result.current.total).toBe(1);
  });

  it('una nota sin deletedAt cuenta como no borrada', () => {
    const { result } = renderWithNotes({ legacy: { title: 'Legacy', fsrsDue: VENCIDA } });
    expect(result.current.items.map((n) => n.id)).toEqual(['legacy']);
  });
});
