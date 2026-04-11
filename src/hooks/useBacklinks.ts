import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';

export interface Backlink {
  linkId: string;
  sourceId: string;
  sourceTitle: string;
  context: string;
}

// Hook reactivo: filtra links cuyo targetId coincide con la nota actual
// y resuelve el sourceTitle desde notesStore en memoria (no desde el doc
// cacheado de links/). Esto evita títulos stale cuando la nota origen
// cambia de título — el campo denormalizado en links/ solo se refresca
// cuando el source re-guarda, pero notesStore siempre está al día.
export default function useBacklinks(noteId: string | undefined): Backlink[] {
  const linksTable = useTable('links', 'links');
  const notesTable = useTable('notes');

  return useMemo(() => {
    if (!noteId) return [];
    const out: Backlink[] = [];
    for (const [linkId, row] of Object.entries(linksTable)) {
      if (row.targetId !== noteId) continue;
      const sourceId = (row.sourceId as string) ?? '';
      const cachedTitle = (row.sourceTitle as string) ?? '';
      const freshTitle =
        ((notesTable[sourceId]?.title as string) || '').trim() || cachedTitle || 'Sin título';
      out.push({
        linkId,
        sourceId,
        sourceTitle: freshTitle,
        context: (row.context as string) ?? '',
      });
    }
    return out;
  }, [linksTable, notesTable, noteId]);
}
