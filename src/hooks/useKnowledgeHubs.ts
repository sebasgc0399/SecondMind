import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';
import { useStoreHydration } from '@/hooks/useStoreHydration';

export interface HubItem {
  noteId: string;
  title: string;
  linkCount: number;
}

const MAX_HUBS = 5;
const MIN_HUB_LINKS = 3;

function hashString(s: string): number {
  return [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
}

export default function useKnowledgeHubs(): {
  items: HubItem[];
  isInitializing: boolean;
} {
  const table = useTable('notes');
  const { isHydrating } = useStoreHydration();

  const items = useMemo(() => {
    const dayKey = new Date().toISOString().split('T')[0]!;
    const candidates: HubItem[] = [];

    for (const [noteId, row] of Object.entries(table)) {
      if (row.isArchived === true || row.isArchived === 1) continue;
      // Papelera: deletedAt > 0 (mismo criterio que useGraph); 0/ausente = no borrada.
      if (typeof row.deletedAt === 'number' && row.deletedAt > 0) continue;
      const linkCount = typeof row.linkCount === 'number' ? row.linkCount : 0;
      if (linkCount < MIN_HUB_LINKS) continue;
      const title = (typeof row.title === 'string' && row.title) || 'Sin título';
      candidates.push({ noteId, title, linkCount });
    }

    candidates.sort((a, b) => hashString(a.noteId + dayKey) - hashString(b.noteId + dayKey));
    return candidates.slice(0, MAX_HUBS);
  }, [table]);

  return { items, isInitializing: isHydrating };
}
