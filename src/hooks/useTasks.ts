import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { tasksStore } from '@/stores/tasksStore';
import { parseIds, stringifyIds } from '@/lib/tinybase';
import useAuth from '@/hooks/useAuth';
import type { Task } from '@/types/task';
import type { Priority, TaskStatus } from '@/types/common';

const INIT_GRACE_MS = 200;

interface CreateTaskOptions {
  priority?: Priority;
  areaId?: string;
  projectId?: string;
}

interface UseTasksReturn {
  tasks: Task[];
  isInitializing: boolean;
  createTask: (name: string, options?: CreateTaskOptions) => Promise<string | null>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
}

export default function useTasks(): UseTasksReturn {
  const { user } = useAuth();
  const table = useTable('tasks', 'tasks');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsInitializing(false), INIT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, []);

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

  const createTask = useCallback(
    async (name: string, options?: CreateTaskOptions): Promise<string | null> => {
      if (!user) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;

      const taskId = crypto.randomUUID();
      const now = Date.now();

      const defaults = {
        name: trimmed,
        status: 'in-progress' as TaskStatus,
        priority: (options?.priority ?? 'medium') as Priority,
        dueDate: now,
        projectId: options?.projectId ?? '',
        areaId: options?.areaId ?? '',
        objectiveId: '',
        noteIds: '[]',
        description: '',
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        completedAt: 0,
      };

      try {
        await setDoc(doc(db, 'users', user.uid, 'tasks', taskId), defaults, { merge: true });
        tasksStore.setRow('tasks', taskId, defaults);
        return taskId;
      } catch (error) {
        console.error('[useTasks] createTask failed', error);
        return null;
      }
    },
    [user],
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<Task>): Promise<void> => {
      if (!user) return;
      const now = Date.now();

      // Serializar noteIds si viene como string[] (resto de campos son flat)
      const serialized: Record<string, string | number | boolean> = { updatedAt: now };
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'noteIds') continue;
        if (value === undefined) continue;
        serialized[key] = value as string | number | boolean;
      }
      if (updates.noteIds !== undefined) {
        serialized.noteIds = stringifyIds(updates.noteIds);
      }

      try {
        await setDoc(doc(db, 'users', user.uid, 'tasks', id), serialized, { merge: true });
        tasksStore.setPartialRow('tasks', id, serialized);
      } catch (error) {
        console.error('[useTasks] updateTask failed', error);
      }
    },
    [user],
  );

  const completeTask = useCallback(
    async (id: string): Promise<void> => {
      const row = tasksStore.getRow('tasks', id);
      const isCompleted = (row.status as string) === 'completed';
      if (isCompleted) {
        // Toggle: destildar → volver a in-progress
        await updateTask(id, { status: 'in-progress', completedAt: 0 });
      } else {
        await updateTask(id, { status: 'completed', completedAt: Date.now() });
      }
    },
    [updateTask],
  );

  return { tasks, isInitializing, createTask, updateTask, completeTask };
}
