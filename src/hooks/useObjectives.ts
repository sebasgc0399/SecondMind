import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { objectivesStore } from '@/stores/objectivesStore';
import { parseIds, stringifyIds } from '@/lib/tinybase';
import useAuth from '@/hooks/useAuth';
import type { Objective } from '@/types/objective';
import type { ObjectiveStatus } from '@/types/common';

const INIT_GRACE_MS = 200;

interface CreateObjectiveInput {
  name: string;
  areaId: string;
  deadline: number;
}

interface UseObjectivesReturn {
  objectives: Objective[];
  isInitializing: boolean;
  createObjective: (input: CreateObjectiveInput) => Promise<string | null>;
  updateObjective: (id: string, updates: Partial<Objective>) => Promise<void>;
}

export default function useObjectives(): UseObjectivesReturn {
  const { user } = useAuth();
  const table = useTable('objectives', 'objectives');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsInitializing(false), INIT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const objectives = useMemo<Objective[]>(() => {
    const out: Objective[] = [];
    for (const [id, row] of Object.entries(table)) {
      out.push({
        id,
        name: (row.name as string) || '',
        status: ((row.status as string) || 'not-started') as ObjectiveStatus,
        deadline: Number(row.deadline) || 0,
        areaId: (row.areaId as string) || '',
        projectIds: parseIds(row.projectIds as string | undefined),
        taskIds: parseIds(row.taskIds as string | undefined),
        isArchived: Boolean(row.isArchived),
        createdAt: Number(row.createdAt) || 0,
        updatedAt: Number(row.updatedAt) || 0,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }, [table]);

  const createObjective = useCallback(
    async ({ name, areaId, deadline }: CreateObjectiveInput): Promise<string | null> => {
      if (!user) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;

      const objectiveId = crypto.randomUUID();
      const now = Date.now();

      const defaults = {
        name: trimmed,
        status: 'not-started' as ObjectiveStatus,
        deadline,
        areaId,
        projectIds: '[]',
        taskIds: '[]',
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await setDoc(doc(db, 'users', user.uid, 'objectives', objectiveId), defaults, {
          merge: true,
        });
        objectivesStore.setRow('objectives', objectiveId, defaults);
        return objectiveId;
      } catch (error) {
        console.error('[useObjectives] createObjective failed', error);
        return null;
      }
    },
    [user],
  );

  const updateObjective = useCallback(
    async (id: string, updates: Partial<Objective>): Promise<void> => {
      if (!user) return;
      const now = Date.now();

      const serialized: Record<string, string | number | boolean> = { updatedAt: now };
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'projectIds' || key === 'taskIds') continue;
        if (value === undefined) continue;
        serialized[key] = value as string | number | boolean;
      }
      if (updates.projectIds !== undefined) {
        serialized.projectIds = stringifyIds(updates.projectIds);
      }
      if (updates.taskIds !== undefined) {
        serialized.taskIds = stringifyIds(updates.taskIds);
      }

      try {
        await setDoc(doc(db, 'users', user.uid, 'objectives', id), serialized, { merge: true });
        objectivesStore.setPartialRow('objectives', id, serialized);
      } catch (error) {
        console.error('[useObjectives] updateObjective failed', error);
      }
    },
    [user],
  );

  return { objectives, isInitializing, createObjective, updateObjective };
}
