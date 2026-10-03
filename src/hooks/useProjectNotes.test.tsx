// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'tinybase/ui-react';
import { createStore } from 'tinybase';
import useProjectNotes from '@/hooks/useProjectNotes';
import { initTestI18n } from '@/test/i18n';

type Rows = Record<string, Record<string, string | number | boolean>>;

function renderWithNotes(notes: Rows, projectId = 'p1') {
  const store = createStore().setTable('notes', notes);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return { store, ...renderHook(() => useProjectNotes(projectId), { wrapper }) };
}

const TRASHED = 1_700_000_000_000;

describe('useProjectNotes', () => {
  // Inicializa la instancia i18n real (patrón del repo) para que useTranslation no
  // avise por falta de instancia.
  beforeAll(async () => {
    await initTestI18n();
  });

  it('lista solo las notas vivas vinculadas al proyecto', () => {
    const { result } = renderWithNotes({
      viva: { title: 'Viva', projectIds: '["p1"]', deletedAt: 0, updatedAt: 2 },
      papelera: { title: 'Papelera', projectIds: '["p1"]', deletedAt: TRASHED, updatedAt: 3 },
      legacy: { title: 'Legacy', projectIds: '["p1"]', updatedAt: 1 },
      otra: { title: 'Otra', projectIds: '["p2"]', deletedAt: 0 },
    });
    expect(result.current.linkedNotes.map((n) => n.id)).toEqual(['viva', 'legacy']);
  });

  it('hasAnyNotes ignora las notas en la papelera', () => {
    const solo = renderWithNotes({ papelera: { title: 'P', deletedAt: TRASHED } });
    expect(solo.result.current.hasAnyNotes).toBe(false);
    const conViva = renderWithNotes({
      papelera: { title: 'P', deletedAt: TRASHED },
      viva: { title: 'V', deletedAt: 0 },
    });
    expect(conViva.result.current.hasAnyNotes).toBe(true);
  });

  it('restaurar una nota la hace reaparecer', () => {
    const { result, store } = renderWithNotes({
      n: { title: 'N', projectIds: '["p1"]', deletedAt: TRASHED },
    });
    expect(result.current.linkedNotes).toEqual([]);
    act(() => {
      store.setCell('notes', 'n', 'deletedAt', 0);
    });
    expect(result.current.linkedNotes.map((n) => n.id)).toEqual(['n']);
  });
});
