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
import { notesStore } from '@/stores/notesStore';
import { tasksStore } from '@/stores/tasksStore';
import { projectsStore } from '@/stores/projectsStore';
import { objectivesStore } from '@/stores/objectivesStore';
import { habitsStore } from '@/stores/habitsStore';
import { inboxStore } from '@/stores/inboxStore';

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

function noteLabel(id: string): string {
  const title = notesStore.getCell('notes', id, 'title');
  return typeof title === 'string' && title.trim().length > 0 ? title : 'Nota sin nombre';
}

function taskLabel(id: string): string {
  const name = tasksStore.getCell('tasks', id, 'name');
  return typeof name === 'string' && name.trim().length > 0 ? name : 'Tarea sin nombre';
}

function projectLabel(id: string): string {
  const name = projectsStore.getCell('projects', id, 'name');
  return typeof name === 'string' && name.trim().length > 0 ? name : 'Proyecto sin nombre';
}

function objectiveLabel(id: string): string {
  const name = objectivesStore.getCell('objectives', id, 'name');
  return typeof name === 'string' && name.trim().length > 0 ? name : 'Objetivo sin nombre';
}

function habitLabel(id: string): string {
  // ID determinístico YYYY-MM-DD (gotcha relaciones-entidades). Si no parsea,
  // fallback al id raw.
  const parts = id.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    if (y && m && d) return `Hábitos del ${d}/${m}/${y}`;
  }
  // Fallback: leer la row si existe.
  const dateMs = habitsStore.getCell('habits', id, 'date');
  if (typeof dateMs === 'number' && dateMs > 0) {
    return `Hábitos del ${new Date(dateMs).toLocaleDateString('es')}`;
  }
  return `Hábitos (${id})`;
}

const INBOX_TRUNCATE = 80;
function inboxLabel(id: string): string {
  const raw = inboxStore.getCell('inbox', id, 'rawContent');
  if (typeof raw !== 'string' || raw.trim().length === 0) return 'Item sin contenido';
  const trimmed = raw.trim();
  return trimmed.length > INBOX_TRUNCATE ? `${trimmed.slice(0, INBOX_TRUNCATE)}…` : trimmed;
}

interface QueueBinding {
  queue: SaveQueue<unknown>;
  entityType: DiscardableEntityType;
  entityLabel: string;
  getLabel: (id: string) => string;
}

const BINDINGS: ReadonlyArray<QueueBinding> = [
  {
    queue: saveContentQueue as unknown as SaveQueue<unknown>,
    entityType: 'note',
    entityLabel: 'Notas',
    getLabel: noteLabel,
  },
  {
    queue: saveNotesMetaQueue as unknown as SaveQueue<unknown>,
    entityType: 'note',
    entityLabel: 'Notas',
    getLabel: noteLabel,
  },
  {
    queue: saveNotesCreatesQueue as unknown as SaveQueue<unknown>,
    entityType: 'note',
    entityLabel: 'Notas',
    getLabel: noteLabel,
  },
  {
    queue: saveTasksQueue as unknown as SaveQueue<unknown>,
    entityType: 'task',
    entityLabel: 'Tareas',
    getLabel: taskLabel,
  },
  {
    queue: saveTasksCreatesQueue as unknown as SaveQueue<unknown>,
    entityType: 'task',
    entityLabel: 'Tareas',
    getLabel: taskLabel,
  },
  {
    queue: saveProjectsQueue as unknown as SaveQueue<unknown>,
    entityType: 'project',
    entityLabel: 'Proyectos',
    getLabel: projectLabel,
  },
  {
    queue: saveProjectsCreatesQueue as unknown as SaveQueue<unknown>,
    entityType: 'project',
    entityLabel: 'Proyectos',
    getLabel: projectLabel,
  },
  {
    queue: saveObjectivesQueue as unknown as SaveQueue<unknown>,
    entityType: 'objective',
    entityLabel: 'Objetivos',
    getLabel: objectiveLabel,
  },
  {
    queue: saveObjectivesCreatesQueue as unknown as SaveQueue<unknown>,
    entityType: 'objective',
    entityLabel: 'Objetivos',
    getLabel: objectiveLabel,
  },
  {
    queue: saveHabitsQueue as unknown as SaveQueue<unknown>,
    entityType: 'habit',
    entityLabel: 'Hábitos',
    getLabel: habitLabel,
  },
  {
    queue: saveInboxQueue as unknown as SaveQueue<unknown>,
    entityType: 'inboxItem',
    entityLabel: 'Inbox',
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
        entityLabel: binding.entityLabel,
        id,
        label: binding.getLabel(id),
      });
    }
  }
  return [...seen.values()];
}
