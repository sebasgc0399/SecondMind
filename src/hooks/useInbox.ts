import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTable } from 'tinybase/ui-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseIds } from '@/lib/tinybase';
import { inboxStore } from '@/stores/inboxStore';
import { notesStore } from '@/stores/notesStore';
import useAuth from '@/hooks/useAuth';
import useTasks from '@/hooks/useTasks';
import useProjects from '@/hooks/useProjects';
import type { AreaKey } from '@/types/area';
import type { Priority } from '@/types/common';
import type {
  ConvertOverrides,
  InboxAiResult,
  InboxItem,
  InboxResultType,
  InboxSource,
} from '@/types/inbox';

const INIT_GRACE_MS = 200;

interface UseInboxReturn {
  items: InboxItem[];
  isInitializing: boolean;
  convertToNote: (itemId: string, overrides?: ConvertOverrides) => Promise<void>;
  convertToTask: (itemId: string, overrides?: ConvertOverrides) => Promise<void>;
  convertToProject: (itemId: string, overrides?: ConvertOverrides) => Promise<void>;
  dismiss: (itemId: string) => void;
}

export default function useInbox(): UseInboxReturn {
  const { user } = useAuth();
  const navigate = useNavigate();
  const table = useTable('inbox', 'inbox');
  const { createTask } = useTasks();
  const { createProject } = useProjects();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsInitializing(false), INIT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, []);

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
    async (itemId: string, overrides?: ConvertOverrides) => {
      if (!user) return;
      const row = inboxStore.getRow('inbox', itemId);
      if (!row || Object.keys(row).length === 0) return;

      const rawContent = (row.rawContent as string) || '';
      const newNoteId = crypto.randomUUID();
      const now = Date.now();
      const firstLine = rawContent.split('\n', 1)[0]?.trim() ?? '';
      const defaultTitle = firstLine.slice(0, 200) || 'Sin título';
      const title = overrides?.title ?? defaultTitle;
      const tagIds = overrides?.tags ? JSON.stringify(overrides.tags) : '[]';

      const docJson = {
        type: 'doc',
        content: rawContent
          .split('\n')
          .map((line) =>
            line.trim()
              ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
              : { type: 'paragraph' },
          ),
      };

      const defaults = {
        title,
        content: JSON.stringify(docJson),
        contentPlain: rawContent,
        paraType: 'resource',
        noteType: 'fleeting',
        source: 'inbox',
        projectIds: '[]',
        areaIds: '[]',
        tagIds,
        outgoingLinkIds: '[]',
        incomingLinkIds: '[]',
        linkCount: 0,
        summaryL1: '',
        summaryL2: '',
        summaryL3: '',
        distillLevel: 0,
        aiTags: '[]',
        aiSummary: '',
        aiProcessed: false,
        createdAt: now,
        updatedAt: now,
        lastViewedAt: 0,
        viewCount: 0,
        isFavorite: false,
        isArchived: false,
      };

      try {
        await setDoc(doc(db, 'users', user.uid, 'notes', newNoteId), defaults);
        notesStore.setRow('notes', newNoteId, defaults);
        inboxStore.setPartialRow('inbox', itemId, {
          status: 'processed',
          processedAs: JSON.stringify({ type: 'note', resultId: newNoteId }),
        });
        navigate(`/notes/${newNoteId}`);
      } catch (error) {
        console.error('[useInbox] convertToNote failed', error);
      }
    },
    [navigate, user],
  );

  const convertToTask = useCallback(
    async (itemId: string, overrides?: ConvertOverrides) => {
      if (!user) return;
      const row = inboxStore.getRow('inbox', itemId);
      if (!row || Object.keys(row).length === 0) return;

      const rawContent = (row.rawContent as string) || '';
      const defaultTitle = rawContent.slice(0, 200) || 'Sin título';
      const finalTitle = (overrides?.title ?? (row.aiSuggestedTitle as string)) || defaultTitle;
      const finalPriority = (overrides?.priority ??
        ((row.aiPriority as string) || 'medium')) as Priority;
      const finalArea = overrides?.area ?? ((row.aiSuggestedArea as string) || '');

      const taskId = await createTask(finalTitle, {
        priority: finalPriority,
        areaId: finalArea,
      });
      if (!taskId) return;

      inboxStore.setPartialRow('inbox', itemId, {
        status: 'processed',
        processedAs: JSON.stringify({ type: 'task', resultId: taskId }),
      });
      navigate('/tasks');
    },
    [user, createTask, navigate],
  );

  const convertToProject = useCallback(
    async (itemId: string, overrides?: ConvertOverrides) => {
      if (!user) return;
      const row = inboxStore.getRow('inbox', itemId);
      if (!row || Object.keys(row).length === 0) return;

      const rawContent = (row.rawContent as string) || '';
      const defaultTitle = rawContent.slice(0, 200) || 'Sin título';
      const finalTitle = (overrides?.title ?? (row.aiSuggestedTitle as string)) || defaultTitle;
      const finalPriority = (overrides?.priority ??
        ((row.aiPriority as string) || 'medium')) as Priority;
      const rawArea = overrides?.area ?? ((row.aiSuggestedArea as string) || '');
      const finalArea: AreaKey = (rawArea || 'conocimiento') as AreaKey;

      const projectId = await createProject({
        name: finalTitle,
        areaId: finalArea,
        priority: finalPriority,
      });
      if (!projectId) return;

      inboxStore.setPartialRow('inbox', itemId, {
        status: 'processed',
        processedAs: JSON.stringify({ type: 'project', resultId: projectId }),
      });
      navigate(`/projects/${projectId}`);
    },
    [user, createProject, navigate],
  );

  const dismiss = useCallback((itemId: string) => {
    inboxStore.setPartialRow('inbox', itemId, { status: 'dismissed' });
  }, []);

  return { items, isInitializing, convertToNote, convertToTask, convertToProject, dismiss };
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
