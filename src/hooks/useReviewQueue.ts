import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';
import { useStoreHydration } from '@/hooks/useStoreHydration';
import { rowToOramaDoc, type NoteOramaDoc } from '@/lib/orama';
import { endOfDay } from '@/lib/formatDate';

export type ReviewItem = NoteOramaDoc & { fsrsDue: number };

export default function useReviewQueue(): {
  items: ReviewItem[];
  total: number;
  isLoading: boolean;
} {
  const table = useTable('notes');
  const { isHydrating } = useStoreHydration();

  const items = useMemo(() => {
    const todayEnd = endOfDay();
    const result: ReviewItem[] = [];

    for (const [id, row] of Object.entries(table)) {
      if (row.isArchived === true || row.isArchived === 1) continue;
      const fsrsDue = typeof row.fsrsDue === 'number' ? row.fsrsDue : 0;
      if (fsrsDue <= 0 || fsrsDue > todayEnd) continue;
      result.push({ ...rowToOramaDoc(id, row), fsrsDue });
    }

    result.sort((a, b) => a.fsrsDue - b.fsrsDue);
    return result;
  }, [table]);

  return { items, total: items.length, isLoading: isHydrating };
}
