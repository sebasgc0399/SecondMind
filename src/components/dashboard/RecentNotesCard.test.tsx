// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Provider } from 'tinybase/ui-react';
import RecentNotesCard from '@/components/dashboard/RecentNotesCard';
import { notesStore } from '@/stores/notesStore';
import { initTestI18n } from '@/test/i18n';

describe('RecentNotesCard', () => {
  beforeAll(async () => {
    await initTestI18n();
  });

  beforeEach(() => {
    notesStore.delTables();
    notesStore.setTable('notes', {
      viva: { title: 'Nota viva', updatedAt: 2 },
      papelera: { title: 'Nota papelera', updatedAt: 3, deletedAt: 1_700_000_000_000 },
    });
  });

  it('no lista notas en la papelera', () => {
    render(
      <Provider store={notesStore}>
        <MemoryRouter>
          <RecentNotesCard />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText('Nota viva')).toBeTruthy();
    expect(screen.queryByText('Nota papelera')).toBeNull();
  });
});
