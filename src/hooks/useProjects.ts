import { useEffect, useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { projectsRepo, type CreateProjectInput } from '@/infra/repos/projectsRepo';
import { parseIds } from '@/lib/tinybase';
import type { Project } from '@/types/project';
import type { Priority, ProjectStatus } from '@/types/common';

const INIT_GRACE_MS = 200;

interface UseProjectsReturn {
  projects: Project[];
  isInitializing: boolean;
  createProject: (input: CreateProjectInput) => Promise<string | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
}

export default function useProjects(): UseProjectsReturn {
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

  return {
    projects,
    isInitializing,
    createProject: projectsRepo.createProject,
    updateProject: projectsRepo.updateProject,
  };
}
