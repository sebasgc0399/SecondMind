import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';
import { useTranslation } from 'react-i18next';
import { parseIds } from '@/lib/tinybase';
import { isLiveNote } from '@/lib/noteGuards';
import type { LinkedNote } from '@/components/projects/ProjectNoteList';

interface UseProjectNotesReturn {
  linkedNotes: LinkedNote[];
  // ¿Hay alguna nota viva en el sistema? (las de la papelera no cuentan)
  hasAnyNotes: boolean;
}

// Notas vinculadas a un proyecto (excluye las de la papelera) + flag de notas vivas.
export default function useProjectNotes(projectId: string | undefined): UseProjectNotesReturn {
  const { t } = useTranslation();
  const notesTable = useTable('notes');

  const linkedNotes = useMemo<LinkedNote[]>(() => {
    if (!projectId) return [];
    const out: LinkedNote[] = [];
    for (const [id, row] of Object.entries(notesTable)) {
      if (!isLiveNote(row)) continue;
      const projectIds = parseIds(row.projectIds as string | undefined);
      if (!projectIds.includes(projectId)) continue;
      out.push({
        id,
        title: ((row.title as string) || '').trim() || t('common.untitled', 'Sin título'),
        paraType: (row.paraType as string) || 'resource',
        noteType: (row.noteType as string) || 'fleeting',
        updatedAt: Number(row.updatedAt) || 0,
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notesTable, projectId, t]);

  const hasAnyNotes = useMemo(
    () => Object.values(notesTable).some((row) => isLiveNote(row)),
    [notesTable],
  );

  return { linkedNotes, hasAnyNotes };
}
