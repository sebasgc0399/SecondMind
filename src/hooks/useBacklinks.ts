import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';

export interface Backlink {
  linkId: string;
  sourceId: string;
  sourceTitle: string;
  context: string;
}

// Hook reactivo sobre linksStore: filtra los links cuyo targetId coincide
// con la nota actual. El componente que lo usa re-renderiza cuando el
// linksStore cambia (saves que crean/eliminan links).
// Los títulos denormalizados en cada link pueden quedar stale si el
// source cambia de título; F7 resolverá titles frescos desde notesStore
// al renderizar. Aquí retornamos lo que hay en linksStore tal cual.
export default function useBacklinks(noteId: string | undefined): Backlink[] {
  const linksTable = useTable('links', 'links');

  return useMemo(() => {
    if (!noteId) return [];
    const out: Backlink[] = [];
    for (const [linkId, row] of Object.entries(linksTable)) {
      if (row.targetId !== noteId) continue;
      out.push({
        linkId,
        sourceId: (row.sourceId as string) ?? '',
        sourceTitle: (row.sourceTitle as string) ?? '',
        context: (row.context as string) ?? '',
      });
    }
    return out;
  }, [linksTable, noteId]);
}
