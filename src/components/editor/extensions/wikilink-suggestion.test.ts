import { beforeEach, describe, expect, it } from 'vitest';
import { notesStore } from '@/stores/notesStore';
import { queryWikilinkItems } from '@/components/editor/extensions/wikilink-suggestion';

describe('queryWikilinkItems', () => {
  beforeEach(() => {
    notesStore.delTables();
  });

  it('no sugiere notas en la papelera', () => {
    notesStore.setTable('notes', {
      viva: { title: 'Zorro viva', updatedAt: 2 },
      papelera: { title: 'Zorro papelera', updatedAt: 3, deletedAt: 1_700_000_000_000 },
    });
    expect(queryWikilinkItems('').map((i) => i.id)).toEqual(['viva']);
    expect(queryWikilinkItems('Zorro').map((i) => i.id)).toEqual(['viva']);
  });
});
