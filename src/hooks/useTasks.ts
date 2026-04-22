import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';
import { tasksRepo, type CreateTaskOptions } from '@/infra/repos/tasksRepo';
import { parseIds } from '@/lib/tinybase';
import { useStoreHydration } from '@/hooks/useStoreHydration';
import type { Task } from '@/types/task';
import type { Priority, TaskStatus } from '@/types/common';

interface UseTasksReturn {
  tasks: Task[];
  isInitializing: boolean;
  createTask: (name: string, options?: CreateTaskOptions) => Promise<string | null>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
}

export default function useTasks(): UseTasksReturn {
  const table = useTable('tasks', 'tasks');
  const { isHydrating } = useStoreHydration();

  const tasks = useMemo<Task[]>(() => {
    const out: Task[] = [];
    for (const [id, row] of Object.entries(table)) {
      out.push({
        id,
        name: (row.name as string) || '',
        status: ((row.status as string) || 'in-progress') as TaskStatus,
        priority: ((row.priority as string) || 'medium') as Priority,
        dueDate: Number(row.dueDate) || 0,
        projectId: (row.projectId as string) || '',
        areaId: (row.areaId as string) || '',
        objectiveId: (row.objectiveId as string) || '',
        noteIds: parseIds(row.noteIds as string | undefined),
        description: (row.description as string) || '',
        isArchived: Boolean(row.isArchived),
        createdAt: Number(row.createdAt) || 0,
        updatedAt: Number(row.updatedAt) || 0,
        completedAt: Number(row.completedAt) || 0,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }, [table]);

  return {
    tasks,
    isInitializing: isHydrating,
    createTask: tasksRepo.createTask,
    updateTask: tasksRepo.updateTask,
    completeTask: tasksRepo.completeTask,
  };
}
