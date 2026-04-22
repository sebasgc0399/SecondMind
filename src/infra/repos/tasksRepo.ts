import { createFirestoreRepo, type RepoRow } from '@/infra/repos/baseRepo';
import { stringifyIds } from '@/lib/tinybase';
import { tasksStore } from '@/stores/tasksStore';
import type { Priority, TaskStatus } from '@/types/common';
import type { Task } from '@/types/task';

export interface CreateTaskOptions {
  priority?: Priority;
  areaId?: string;
  projectId?: string;
}

// Row serializada para TinyBase/Firestore (noteIds como JSON string).
interface TaskRow extends RepoRow {
  name: string;
  status: string;
  priority: string;
  dueDate: number;
  projectId: string;
  areaId: string;
  objectiveId: string;
  noteIds: string;
  description: string;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number;
}

const repo = createFirestoreRepo<TaskRow>({
  store: tasksStore,
  table: 'tasks',
  pathFor: (uid, id) => `users/${uid}/tasks/${id}`,
});

function computeNextTaskStatus(current: string): { status: TaskStatus; completedAt: number } {
  if (current === 'completed') {
    return { status: 'in-progress', completedAt: 0 };
  }
  return { status: 'completed', completedAt: Date.now() };
}

async function createTask(name: string, options?: CreateTaskOptions): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const now = Date.now();
  const defaults: TaskRow = {
    name: trimmed,
    status: 'in-progress',
    priority: options?.priority ?? 'medium',
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
    return await repo.create(defaults);
  } catch (error) {
    console.error('[tasksRepo] createTask failed', error);
    return null;
  }
}

/**
 * Actualiza campos de una tarea.
 *
 * IMPORTANTE: `updates.noteIds` debe pasarse como `string[]` (array JS). El repo
 * lo serializa internamente con `stringifyIds`. `stringifyIds` NO es idempotente:
 * NUNCA pasar una string ya serializada — produciría nested escaping.
 */
async function updateTask(id: string, updates: Partial<Task>): Promise<void> {
  const now = Date.now();
  const serialized: Partial<TaskRow> = { updatedAt: now };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id' || key === 'noteIds') continue;
    if (value === undefined) continue;
    (serialized as Record<string, string | number | boolean>)[key] = value as
      | string
      | number
      | boolean;
  }
  if (updates.noteIds !== undefined) {
    serialized.noteIds = stringifyIds(updates.noteIds);
  }

  try {
    await repo.update(id, serialized);
  } catch (error) {
    console.error('[tasksRepo] updateTask failed', error);
  }
}

async function completeTask(id: string): Promise<void> {
  const row = tasksStore.getRow('tasks', id);
  const next = computeNextTaskStatus((row.status as string) ?? 'in-progress');
  await updateTask(id, next);
}

export const tasksRepo = { createTask, updateTask, completeTask };
