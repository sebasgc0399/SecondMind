import { createFirestoreRepo } from '@/infra/repos/baseRepo';
import { saveProjectsQueue } from '@/lib/saveQueue';
import { projectsStore } from '@/stores/projectsStore';
import { stringifyIds } from '@/lib/tinybase';
import type { Priority } from '@/types/common';
import type { Project } from '@/types/project';
import type { ProjectRow } from '@/types/repoRows';

export interface CreateProjectInput {
  name: string;
  areaId: string;
  priority: Priority;
}

const repo = createFirestoreRepo<ProjectRow>({
  store: projectsStore,
  table: 'projects',
  pathFor: (uid, id) => `users/${uid}/projects/${id}`,
  queue: saveProjectsQueue,
});

async function createProject({
  name,
  areaId,
  priority,
}: CreateProjectInput): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const now = Date.now();
  const defaults: ProjectRow = {
    name: trimmed,
    status: 'not-started',
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
    return await repo.create(defaults);
  } catch (error) {
    console.error('[projectsRepo] createProject failed', error);
    return null;
  }
}

/**
 * Actualiza campos de un proyecto.
 *
 * IMPORTANTE: `updates.taskIds` y `updates.noteIds` deben pasarse como `string[]`
 * (arrays JS). El repo los serializa con `stringifyIds`. `stringifyIds` NO es
 * idempotente — NUNCA pasar strings ya serializadas.
 */
async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const now = Date.now();
  const serialized: Partial<ProjectRow> = { updatedAt: now };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id' || key === 'taskIds' || key === 'noteIds') continue;
    if (value === undefined) continue;
    (serialized as Record<string, string | number | boolean>)[key] = value as
      | string
      | number
      | boolean;
  }
  if (updates.taskIds !== undefined) {
    serialized.taskIds = stringifyIds(updates.taskIds);
  }
  if (updates.noteIds !== undefined) {
    serialized.noteIds = stringifyIds(updates.noteIds);
  }

  try {
    await repo.update(id, serialized);
  } catch (error) {
    console.error('[projectsRepo] updateProject failed', error);
  }
}

export const projectsRepo = { createProject, updateProject };
