import { createFirestoreRepo } from '@/infra/repos/baseRepo';
import { saveInboxQueue } from '@/lib/saveQueue';
import { inboxStore } from '@/stores/inboxStore';
import { notesRepo } from '@/infra/repos/notesRepo';
import { tasksRepo } from '@/infra/repos/tasksRepo';
import { projectsRepo } from '@/infra/repos/projectsRepo';
import type { AreaKey } from '@/types/area';
import type { Priority } from '@/types/common';
import type { ConvertOverrides } from '@/types/inbox';
import type { InboxRow } from '@/types/repoRows';

const repo = createFirestoreRepo<InboxRow>({
  store: inboxStore,
  table: 'inbox',
  pathFor: (uid, id) => `users/${uid}/inbox/${id}`,
  queue: saveInboxQueue,
});

/**
 * Marca un inbox item como procesado — NO lo borra físicamente.
 * Gotcha de ESTADO-ACTUAL: "items de inbox nunca se borran, se marcan
 * `status: 'processed'` o `'dismissed'` para preservar historial".
 */
async function markProcessed(
  itemId: string,
  processedAs: { type: 'note' | 'task' | 'project'; resultId: string },
): Promise<void> {
  try {
    await repo.update(itemId, {
      status: 'processed',
      processedAs: JSON.stringify(processedAs),
    });
  } catch (error) {
    console.error('[inboxRepo] markProcessed failed', error);
  }
}

async function dismiss(itemId: string): Promise<void> {
  try {
    await repo.update(itemId, { status: 'dismissed' });
  } catch (error) {
    console.error('[inboxRepo] dismiss failed', error);
  }
}

export interface ConvertResult {
  resultId: string;
}

async function convertToNote(
  itemId: string,
  overrides?: ConvertOverrides,
): Promise<ConvertResult | null> {
  const row = inboxStore.getRow('inbox', itemId);
  if (!row || Object.keys(row).length === 0) return null;

  const rawContent = (row.rawContent as string) || '';
  const firstLine = rawContent.split('\n', 1)[0]?.trim() ?? '';
  const defaultTitle = firstLine.slice(0, 200) || 'Sin título';
  // Fallback: aiSuggestedTitle si no hay override del caller — alinea con
  // convertToTask y convertToProject. Sin esto, accept batch (que no pasa
  // overrides) terminaba con el firstLine como título en lugar del título
  // sugerido por la CF.
  const title = (overrides?.title ?? (row.aiSuggestedTitle as string)) || defaultTitle;
  const tagIds = overrides?.tags ?? [];

  const newNoteId = await notesRepo.createFromInbox(rawContent, { title, tagIds });
  if (!newNoteId) return null;

  await markProcessed(itemId, { type: 'note', resultId: newNoteId });
  return { resultId: newNoteId };
}

async function convertToTask(
  itemId: string,
  overrides?: ConvertOverrides,
): Promise<ConvertResult | null> {
  const row = inboxStore.getRow('inbox', itemId);
  if (!row || Object.keys(row).length === 0) return null;

  const rawContent = (row.rawContent as string) || '';
  const defaultTitle = rawContent.slice(0, 200) || 'Sin título';
  const finalTitle = (overrides?.title ?? (row.aiSuggestedTitle as string)) || defaultTitle;
  const finalPriority = (overrides?.priority ??
    ((row.aiPriority as string) || 'medium')) as Priority;
  const finalArea = overrides?.area ?? ((row.aiSuggestedArea as string) || '');

  const taskId = await tasksRepo.createTask(finalTitle, {
    priority: finalPriority,
    areaId: finalArea,
  });
  if (!taskId) return null;

  await markProcessed(itemId, { type: 'task', resultId: taskId });
  return { resultId: taskId };
}

async function convertToProject(
  itemId: string,
  overrides?: ConvertOverrides,
): Promise<ConvertResult | null> {
  const row = inboxStore.getRow('inbox', itemId);
  if (!row || Object.keys(row).length === 0) return null;

  const rawContent = (row.rawContent as string) || '';
  const defaultTitle = rawContent.slice(0, 200) || 'Sin título';
  const finalTitle = (overrides?.title ?? (row.aiSuggestedTitle as string)) || defaultTitle;
  const finalPriority = (overrides?.priority ??
    ((row.aiPriority as string) || 'medium')) as Priority;
  const rawArea = overrides?.area ?? ((row.aiSuggestedArea as string) || '');
  const finalArea: AreaKey = (rawArea || 'conocimiento') as AreaKey;

  const projectId = await projectsRepo.createProject({
    name: finalTitle,
    areaId: finalArea,
    priority: finalPriority,
  });
  if (!projectId) return null;

  await markProcessed(itemId, { type: 'project', resultId: projectId });
  return { resultId: projectId };
}

export const inboxRepo = {
  convertToNote,
  convertToTask,
  convertToProject,
  dismiss,
};
