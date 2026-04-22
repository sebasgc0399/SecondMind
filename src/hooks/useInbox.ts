import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTable } from 'tinybase/ui-react';
import { inboxRepo } from '@/infra/repos/inboxRepo';
import { parseIds } from '@/lib/tinybase';
import { useStoreHydration } from '@/hooks/useStoreHydration';
import type { AreaKey } from '@/types/area';
import type { Priority } from '@/types/common';
import type {
  ConvertOverrides,
  InboxAiResult,
  InboxItem,
  InboxResultType,
  InboxSource,
} from '@/types/inbox';

interface ConvertOptions {
  skipNavigate?: boolean;
}

interface UseInboxReturn {
  items: InboxItem[];
  isInitializing: boolean;
  convertToNote: (
    itemId: string,
    overrides?: ConvertOverrides,
    options?: ConvertOptions,
  ) => Promise<void>;
  convertToTask: (
    itemId: string,
    overrides?: ConvertOverrides,
    options?: ConvertOptions,
  ) => Promise<void>;
  convertToProject: (
    itemId: string,
    overrides?: ConvertOverrides,
    options?: ConvertOptions,
  ) => Promise<void>;
  dismiss: (itemId: string) => void;
}

export default function useInbox(): UseInboxReturn {
  const navigate = useNavigate();
  const table = useTable('inbox', 'inbox');
  const { isHydrating } = useStoreHydration();

  const items = useMemo<InboxItem[]>(() => {
    const out: InboxItem[] = [];
    for (const [id, row] of Object.entries(table)) {
      if (row.status !== 'pending') continue;

      const aiProcessed = Boolean(row.aiProcessed);
      const suggestedTitle = (row.aiSuggestedTitle as string) || '';
      const aiResult: InboxAiResult | undefined =
        aiProcessed && suggestedTitle
          ? {
              suggestedTitle,
              suggestedType: ((row.aiSuggestedType as string) || 'note') as InboxResultType,
              suggestedTags: parseIds((row.aiSuggestedTags as string) || '[]'),
              suggestedArea: ((row.aiSuggestedArea as string) || 'conocimiento') as AreaKey,
              summary: (row.aiSummary as string) || '',
              priority: ((row.aiPriority as string) || 'medium') as Priority,
              relatedNoteIds: [],
            }
          : undefined;

      out.push({
        id,
        rawContent: (row.rawContent as string) || '',
        source: ((row.source as string) || 'quick-capture') as InboxSource,
        sourceUrl: (row.sourceUrl as string) || undefined,
        aiProcessed,
        aiResult,
        status: 'pending',
        createdAt: Number(row.createdAt) || 0,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }, [table]);

  const convertToNote = useCallback(
    async (itemId: string, overrides?: ConvertOverrides, options?: ConvertOptions) => {
      const result = await inboxRepo.convertToNote(itemId, overrides);
      if (!result) return;
      if (!options?.skipNavigate) navigate(`/notes/${result.resultId}`);
    },
    [navigate],
  );

  const convertToTask = useCallback(
    async (itemId: string, overrides?: ConvertOverrides, options?: ConvertOptions) => {
      const result = await inboxRepo.convertToTask(itemId, overrides);
      if (!result) return;
      if (!options?.skipNavigate) navigate('/tasks');
    },
    [navigate],
  );

  const convertToProject = useCallback(
    async (itemId: string, overrides?: ConvertOverrides, options?: ConvertOptions) => {
      const result = await inboxRepo.convertToProject(itemId, overrides);
      if (!result) return;
      if (!options?.skipNavigate) navigate(`/projects/${result.resultId}`);
    },
    [navigate],
  );

  const dismiss = useCallback((itemId: string) => {
    void inboxRepo.dismiss(itemId);
  }, []);

  return {
    items,
    isInitializing: isHydrating,
    convertToNote,
    convertToTask,
    convertToProject,
    dismiss,
  };
}

export function usePendingInboxCount(): number {
  const table = useTable('inbox', 'inbox');
  return useMemo(() => {
    let count = 0;
    for (const row of Object.values(table)) {
      if (row.status === 'pending') count += 1;
    }
    return count;
  }, [table]);
}
