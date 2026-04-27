import { createFirestoreRepo } from '@/infra/repos/baseRepo';
import { saveObjectivesQueue } from '@/lib/saveQueue';
import { objectivesStore } from '@/stores/objectivesStore';
import { stringifyIds } from '@/lib/tinybase';
import type { Objective } from '@/types/objective';
import type { ObjectiveRow } from '@/types/repoRows';

export interface CreateObjectiveInput {
  name: string;
  areaId: string;
  deadline: number;
}

const repo = createFirestoreRepo<ObjectiveRow>({
  store: objectivesStore,
  table: 'objectives',
  pathFor: (uid, id) => `users/${uid}/objectives/${id}`,
  queue: saveObjectivesQueue,
});

async function createObjective({
  name,
  areaId,
  deadline,
}: CreateObjectiveInput): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const now = Date.now();
  const defaults: ObjectiveRow = {
    name: trimmed,
    status: 'not-started',
    deadline,
    areaId,
    projectIds: '[]',
    taskIds: '[]',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    return await repo.create(defaults);
  } catch (error) {
    console.error('[objectivesRepo] createObjective failed', error);
    return null;
  }
}

/**
 * Actualiza campos de un objetivo.
 *
 * IMPORTANTE: `updates.projectIds` y `updates.taskIds` deben pasarse como
 * `string[]` (arrays JS). El repo los serializa con `stringifyIds`.
 * `stringifyIds` NO es idempotente — NUNCA pasar strings ya serializadas.
 */
async function updateObjective(id: string, updates: Partial<Objective>): Promise<void> {
  const now = Date.now();
  const serialized: Partial<ObjectiveRow> = { updatedAt: now };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id' || key === 'projectIds' || key === 'taskIds') continue;
    if (value === undefined) continue;
    (serialized as Record<string, string | number | boolean>)[key] = value as
      | string
      | number
      | boolean;
  }
  if (updates.projectIds !== undefined) {
    serialized.projectIds = stringifyIds(updates.projectIds);
  }
  if (updates.taskIds !== undefined) {
    serialized.taskIds = stringifyIds(updates.taskIds);
  }

  try {
    await repo.update(id, serialized);
  } catch (error) {
    console.error('[objectivesRepo] updateObjective failed', error);
  }
}

export const objectivesRepo = { createObjective, updateObjective };
