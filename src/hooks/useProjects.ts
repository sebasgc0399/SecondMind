import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';
import { projectsRepo, type CreateProjectInput } from '@/infra/repos/projectsRepo';
import { parseIds } from '@/lib/tinybase';
import { useStoreHydration } from '@/hooks/useStoreHydration';
import type { Project } from '@/types/project';
import type { Priority, ProjectStatus } from '@/types/common';

interface UseProjectsReturn {
  projects: Project[];
  isInitializing: boolean;
  createProject: (input: CreateProjectInput) => Promise<string | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
}

export default function useProjects(): UseProjectsReturn {
  const table = useTable('projects', 'projects');
  const { isHydrating } = useStoreHydration();

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
    isInitializing: isHydrating,
    createProject: projectsRepo.createProject,
    updateProject: projectsRepo.updateProject,
  };
}
