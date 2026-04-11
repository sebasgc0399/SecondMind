import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { projectsStore } from '@/stores/projectsStore';
import { parseIds, stringifyIds } from '@/lib/tinybase';
import useAuth from '@/hooks/useAuth';
import type { Project } from '@/types/project';
import type { Priority, ProjectStatus } from '@/types/common';

const INIT_GRACE_MS = 200;

interface CreateProjectInput {
  name: string;
  areaId: string;
  priority: Priority;
}

interface UseProjectsReturn {
  projects: Project[];
  isInitializing: boolean;
  createProject: (input: CreateProjectInput) => Promise<string | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
}

export default function useProjects(): UseProjectsReturn {
  const { user } = useAuth();
  const table = useTable('projects', 'projects');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsInitializing(false), INIT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const projects = useMemo<Project[]>(() => {
    const out: Project[] = [];
    for (const [id, row] of Object.entries(table)) {
      out.push({
        id,
        name: (row.name as string) || '',
        status: ((row.status as string) || 'not-started') as ProjectStatus,
        priority: ((row.priority as string) || 'medium') as Priority,
        areaId: (row.areaId as string) || '',
        objectiveId: (row.objectiveId as string) || '',
        taskIds: parseIds(row.taskIds as string | undefined),
        noteIds: parseIds(row.noteIds as string | undefined),
        startDate: Number(row.startDate) || 0,
        deadline: Number(row.deadline) || 0,
        isArchived: Boolean(row.isArchived),
        createdAt: Number(row.createdAt) || 0,
        updatedAt: Number(row.updatedAt) || 0,
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [table]);

  const createProject = useCallback(
    async ({ name, areaId, priority }: CreateProjectInput): Promise<string | null> => {
      if (!user) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;

      const projectId = crypto.randomUUID();
      const now = Date.now();

      const defaults = {
        name: trimmed,
        status: 'not-started' as ProjectStatus,
        priority,
        areaId,
        objectiveId: '',
        taskIds: '[]',
        noteIds: '[]',
        startDate: 0,
        deadline: 0,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await setDoc(doc(db, 'users', user.uid, 'projects', projectId), defaults, { merge: true });
        projectsStore.setRow('projects', projectId, defaults);
        return projectId;
      } catch (error) {
        console.error('[useProjects] createProject failed', error);
        return null;
      }
    },
    [user],
  );

  const updateProject = useCallback(
    async (id: string, updates: Partial<Project>): Promise<void> => {
      if (!user) return;
      const now = Date.now();

      const serialized: Record<string, string | number | boolean> = { updatedAt: now };
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'taskIds' || key === 'noteIds') continue;
        if (value === undefined) continue;
        serialized[key] = value as string | number | boolean;
      }
      if (updates.taskIds !== undefined) {
        serialized.taskIds = stringifyIds(updates.taskIds);
      }
      if (updates.noteIds !== undefined) {
        serialized.noteIds = stringifyIds(updates.noteIds);
      }

      try {
        await setDoc(doc(db, 'users', user.uid, 'projects', id), serialized, { merge: true });
        projectsStore.setPartialRow('projects', id, serialized);
      } catch (error) {
        console.error('[useProjects] updateProject failed', error);
      }
    },
    [user],
  );

  return { projects, isInitializing, createProject, updateProject };
}
