import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';
import { useStoreHydration } from '@/hooks/useStoreHydration';
import usePreferences from '@/hooks/usePreferences';
import type { TrashNote } from '@/types/note';

interface UseTrashNotesOpts {
  // Filtro client-side por título o contentPlain. NO se expone en F19
  // (search dentro de papelera está out of scope), pero la firma queda lista
  // para que F20+ pueda agregar input search sin refactor de callsites.
  filter?: string;
}

interface UseTrashNotesReturn {
  notes: TrashNote[];
  /** Total de notas en papelera (pre-filtro). Usar para badge y purge. */
  count: number;
  /** IDs de todas las notas en papelera (pre-filtro). Usar para purgeAll. */
  allIds: string[];
  isLoading: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function useTrashNotes(opts?: UseTrashNotesOpts): UseTrashNotesReturn {
  const table = useTable('notes');
  const { isHydrating } = useStoreHydration();
  const { preferences } = usePreferences();

  const result = useMemo(() => {
    const now = Date.now();
    const purgeDays = preferences.trashAutoPurgeDays;
    const filter = opts?.filter?.trim().toLowerCase() ?? '';

    const allIds: string[] = [];
    const collected: TrashNote[] = [];
    for (const [noteId, row] of Object.entries(table)) {
      const deletedAt = typeof row.deletedAt === 'number' ? row.deletedAt : 0;
      if (deletedAt <= 0) continue;

      allIds.push(noteId);

      const title = (typeof row.title === 'string' && row.title) || 'Sin título';
      const contentPlain = typeof row.contentPlain === 'string' ? row.contentPlain : '';

      if (filter) {
        const haystack = `${title}\n${contentPlain}`.toLowerCase();
        if (!haystack.includes(filter)) continue;
      }

      // daysUntilPurge: null cuando "Nunca". Si ya pasó el plazo (caso edge:
      // user cambió la pref a un valor menor o el cron diario aún no corrió),
      // se reporta 0 y la UI puede mostrarlo como "Pendiente".
      const daysUntilPurge =
        purgeDays === 0
          ? null
          : Math.max(0, Math.ceil((purgeDays * MS_PER_DAY - (now - deletedAt)) / MS_PER_DAY));

      collected.push({
        id: noteId,
        title,
        contentPlain,
        paraType: typeof row.paraType === 'string' ? row.paraType : 'resource',
        noteType: typeof row.noteType === 'string' ? row.noteType : 'fleeting',
        distillLevel: (typeof row.distillLevel === 'number' ? row.distillLevel : 0) as
          | 0
          | 1
          | 2
          | 3,
        linkCount: typeof row.linkCount === 'number' ? row.linkCount : 0,
        isFavorite: row.isFavorite === true,
        updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
        deletedAt,
        daysUntilPurge,
      });
    }

    collected.sort((a, b) => b.deletedAt - a.deletedAt);
    return { notes: collected, count: allIds.length, allIds };
  }, [table, preferences.trashAutoPurgeDays, opts?.filter]);

  return { ...result, isLoading: isHydrating };
}
