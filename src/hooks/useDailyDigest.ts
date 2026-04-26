import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';
import { useStoreHydration } from '@/hooks/useStoreHydration';
import { endOfDay } from '@/lib/formatDate';

export interface DigestItem {
  noteId: string;
  title: string;
  reason: 'review' | 'hub';
  detail: string;
}

const MAX_REVIEW = 3;
const MAX_TOTAL = 5;
const MIN_HUB_LINKS = 3;

function hashString(s: string): number {
  return [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
}

export default function useDailyDigest(): {
  items: DigestItem[];
  isInitializing: boolean;
} {
  const table = useTable('notes');
  const { isHydrating } = useStoreHydration();

  const items = useMemo(() => {
    const todayEnd = endOfDay();
    const dayKey = new Date().toISOString().split('T')[0]!;
    const result: DigestItem[] = [];
    const includedIds = new Set<string>();

    const reviewCandidates: { noteId: string; title: string; fsrsDue: number }[] = [];
    const hubCandidates: { noteId: string; title: string; linkCount: number }[] = [];

    for (const [noteId, row] of Object.entries(table)) {
      if (row.isArchived === true || row.isArchived === 1) continue;

      const title = (typeof row.title === 'string' && row.title) || 'Sin titulo';
      const fsrsDue = typeof row.fsrsDue === 'number' ? row.fsrsDue : 0;
      const linkCount = typeof row.linkCount === 'number' ? row.linkCount : 0;

      if (fsrsDue > 0 && fsrsDue <= todayEnd) {
        reviewCandidates.push({ noteId, title, fsrsDue });
      }
      if (linkCount >= MIN_HUB_LINKS) {
        hubCandidates.push({ noteId, title, linkCount });
      }
    }

    reviewCandidates.sort((a, b) => a.fsrsDue - b.fsrsDue);
    for (const c of reviewCandidates.slice(0, MAX_REVIEW)) {
      result.push({
        noteId: c.noteId,
        title: c.title,
        reason: 'review',
        detail: 'Revisar hoy',
      });
      includedIds.add(c.noteId);
    }

    const remaining = MAX_TOTAL - result.length;
    if (remaining > 0) {
      const filtered = hubCandidates.filter((c) => !includedIds.has(c.noteId));
      filtered.sort((a, b) => hashString(a.noteId + dayKey) - hashString(b.noteId + dayKey));
      for (const c of filtered.slice(0, remaining)) {
        result.push({
          noteId: c.noteId,
          title: c.title,
          reason: 'hub',
          detail: `Hub: ${c.linkCount} conexiones`,
        });
      }
    }

    return result;
  }, [table]);

  return { items, isInitializing: isHydrating };
}
