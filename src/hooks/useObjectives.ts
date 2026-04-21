import { useEffect, useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { objectivesRepo, type CreateObjectiveInput } from '@/infra/repos/objectivesRepo';
import { parseIds } from '@/lib/tinybase';
import type { Objective } from '@/types/objective';
import type { ObjectiveStatus } from '@/types/common';

const INIT_GRACE_MS = 200;

interface UseObjectivesReturn {
  objectives: Objective[];
  isInitializing: boolean;
  createObjective: (input: CreateObjectiveInput) => Promise<string | null>;
  updateObjective: (id: string, updates: Partial<Objective>) => Promise<void>;
}

export default function useObjectives(): UseObjectivesReturn {
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

  return {
    objectives,
    isInitializing,
    createObjective: objectivesRepo.createObjective,
    updateObjective: objectivesRepo.updateObjective,
  };
}
