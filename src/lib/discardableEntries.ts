import i18n from '@/lib/i18n';
import { notesStore } from '@/stores/notesStore';
import { tasksStore } from '@/stores/tasksStore';
import { projectsStore } from '@/stores/projectsStore';
import { objectivesStore } from '@/stores/objectivesStore';
import { habitsStore } from '@/stores/habitsStore';
import { inboxStore } from '@/stores/inboxStore';
import {
  saveContentQueue,
  saveNotesMetaQueue,
  saveTasksQueue,
  saveProjectsQueue,
  saveObjectivesQueue,
  saveHabitsQueue,
  saveInboxQueue,
  saveNotesCreatesQueue,
  saveTasksCreatesQueue,
  saveProjectsCreatesQueue,
  saveObjectivesCreatesQueue,
  type SaveQueue,
} from './saveQueue';

export type DiscardableEntityType =
  | 'note'
  | 'task'
  | 'project'
  | 'objective'
  | 'habit'
  | 'inboxItem';

export interface DiscardableEntry {
  entityType: DiscardableEntityType;
  entityLabel: string;
  id: string;
  label: string;
}

// Composite keys saveNotesMetaQueue (`${noteId}:accept-${suggestionId}`):
// extraer noteId raw para resolver title del store. Misma lógica que
// `usePendingSyncCount.extractEntityId`.
function extractEntityId(queueKey: string): string {
  const colonIdx = queueKey.indexOf(':');
  return colonIdx === -1 ? queueKey : queueKey.slice(0, colonIdx);
}

// F2.7: labels localizados con i18n.t DIRECTO (module-scope no-React, no puede
// usar hooks). Se resuelven al llamar getDiscardableEntries() / getLabel() —
// es decir, al abrir el dialog, NO a module-eval — así toman el idioma vigente.
function discardableGroupLabel(entityType: DiscardableEntityType): string {
  switch (entityType) {
    case 'note':
      return i18n.t('entities.discardable.group.note', 'Notas');
    case 'task':
      return i18n.t('entities.discardable.group.task', 'Tareas');
    case 'project':
      return i18n.t('entities.discardable.group.project', 'Proyectos');
    case 'objective':
      return i18n.t('entities.discardable.group.objective', 'Objetivos');
    case 'habit':
      return i18n.t('entities.discardable.group.habit', 'Hábitos');
    case 'inboxItem':
      return i18n.t('entities.discardable.group.inboxItem', 'Inbox');
  }
}

function noteLabel(id: string): string {
  const title = notesStore.getCell('notes', id, 'title');
  return typeof title === 'string' && title.trim().length > 0
    ? title
    : i18n.t('entities.discardable.noteUntitled', 'Nota sin nombre');
}

function taskLabel(id: string): string {
  const name = tasksStore.getCell('tasks', id, 'name');
  return typeof name === 'string' && name.trim().length > 0
    ? name
    : i18n.t('entities.discardable.taskUntitled', 'Tarea sin nombre');
}

function projectLabel(id: string): string {
  const name = projectsStore.getCell('projects', id, 'name');
  return typeof name === 'string' && name.trim().length > 0
    ? name
    : i18n.t('entities.discardable.projectUntitled', 'Proyecto sin nombre');
}

function objectiveLabel(id: string): string {
  const name = objectivesStore.getCell('objectives', id, 'name');
  return typeof name === 'string' && name.trim().length > 0
    ? name
    : i18n.t('entities.discardable.objectiveUntitled', 'Objetivo sin nombre');
}

function habitLabel(id: string): string {
  // ID determinístico YYYY-MM-DD (gotcha relaciones-entidades). Si no parsea,
  // fallback al id raw.
  const parts = id.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    if (y && m && d)
      return i18n.t('entities.discardable.habitOfDate', 'Hábitos del {{date}}', {
        date: `${d}/${m}/${y}`,
      });
  }
  // Fallback: leer la row si existe.
  const dateMs = habitsStore.getCell('habits', id, 'date');
  if (typeof dateMs === 'number' && dateMs > 0) {
    return i18n.t('entities.discardable.habitOfDate', 'Hábitos del {{date}}', {
      date: new Date(dateMs).toLocaleDateString(i18n.language || 'es'),
    });
  }
  return i18n.t('entities.discardable.habitFallback', 'Hábitos ({{id}})', { id });
}

const INBOX_TRUNCATE = 80;
function inboxLabel(id: string): string {
  const raw = inboxStore.getCell('inbox', id, 'rawContent');
  if (typeof raw !== 'string' || raw.trim().length === 0)
    return i18n.t('entities.discardable.inboxEmpty', 'Item sin contenido');
  const trimmed = raw.trim();
  return trimmed.length > INBOX_TRUNCATE ? `${trimmed.slice(0, INBOX_TRUNCATE)}…` : trimmed;
}

interface QueueBinding {
  queue: SaveQueue<unknown>;
  entityType: DiscardableEntityType;
  getLabel: (id: string) => string;
}

const BINDINGS: ReadonlyArray<QueueBinding> = [
  {
    queue: saveContentQueue as unknown as SaveQueue<unknown>,
    entityType: 'note',
    getLabel: noteLabel,
  },
  {
    queue: saveNotesMetaQueue as unknown as SaveQueue<unknown>,
    entityType: 'note',
    getLabel: noteLabel,
  },
  {
    queue: saveNotesCreatesQueue as unknown as SaveQueue<unknown>,
    entityType: 'note',
    getLabel: noteLabel,
  },
  {
    queue: saveTasksQueue as unknown as SaveQueue<unknown>,
    entityType: 'task',
    getLabel: taskLabel,
  },
  {
    queue: saveTasksCreatesQueue as unknown as SaveQueue<unknown>,
    entityType: 'task',
    getLabel: taskLabel,
  },
  {
    queue: saveProjectsQueue as unknown as SaveQueue<unknown>,
    entityType: 'project',
    getLabel: projectLabel,
  },
  {
    queue: saveProjectsCreatesQueue as unknown as SaveQueue<unknown>,
    entityType: 'project',
    getLabel: projectLabel,
  },
  {
    queue: saveObjectivesQueue as unknown as SaveQueue<unknown>,
    entityType: 'objective',
    getLabel: objectiveLabel,
  },
  {
    queue: saveObjectivesCreatesQueue as unknown as SaveQueue<unknown>,
    entityType: 'objective',
    getLabel: objectiveLabel,
  },
  {
    queue: saveHabitsQueue as unknown as SaveQueue<unknown>,
    entityType: 'habit',
    getLabel: habitLabel,
  },
  {
    queue: saveInboxQueue as unknown as SaveQueue<unknown>,
    entityType: 'inboxItem',
    getLabel: inboxLabel,
  },
];

// Snapshot one-shot (no reactivo). Se llama al abrir el <DiscardPendingDialog />.
// Dedupea por (entityType, id) — misma nota con 3 entries en distintas queues
// aparece una sola vez. Items con status 'synced' se ignoran.
export function getDiscardableEntries(): DiscardableEntry[] {
  const seen = new Map<string, DiscardableEntry>();
  for (const binding of BINDINGS) {
    for (const [key, entry] of binding.queue.getSnapshot()) {
      if (entry.status === 'synced') continue;
      const id = extractEntityId(key);
      const dedupKey = `${binding.entityType}:${id}`;
      if (seen.has(dedupKey)) continue;
      seen.set(dedupKey, {
        entityType: binding.entityType,
        entityLabel: discardableGroupLabel(binding.entityType),
        id,
        label: binding.getLabel(id),
      });
    }
  }
  return [...seen.values()];
}
