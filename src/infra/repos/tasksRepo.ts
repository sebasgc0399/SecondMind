import { createFirestoreRepo } from '@/infra/repos/baseRepo';
import { saveTasksCreatesQueue, saveTasksQueue } from '@/lib/saveQueue';
import { stringifyIds } from '@/lib/tinybase';
import { tasksStore } from '@/stores/tasksStore';
import type { Priority, TaskStatus } from '@/types/common';
import type { Task } from '@/types/task';
import type { TaskRow } from '@/types/repoRows';

export interface CreateTaskOptions {
  priority?: Priority;
  areaId?: string;
  projectId?: string;
  // Notas vinculadas (E2 T4: tareas creadas desde un item de tarea del editor).
  noteIds?: string[];
  // Estado inicial (E2-T4-c): un item ya marcado nace como tarea completada.
  status?: TaskStatus;
}

const repo = createFirestoreRepo<TaskRow>({
  store: tasksStore,
  table: 'tasks',
  pathFor: (uid, id) => `users/${uid}/tasks/${id}`,
  queue: saveTasksQueue,
  createsQueue: saveTasksCreatesQueue,
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
  const status = options?.status ?? 'in-progress';
  const defaults: TaskRow = {
    name: trimmed,
    status,
    priority: options?.priority ?? 'medium',
    dueDate: now,
    projectId: options?.projectId ?? '',
    areaId: options?.areaId ?? '',
    objectiveId: '',
    noteIds: stringifyIds(options?.noteIds ?? []),
    description: '',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    completedAt: status === 'completed' ? now : 0,
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
