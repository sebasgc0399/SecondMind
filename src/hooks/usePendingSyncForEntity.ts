import { useCallback, useSyncExternalStore } from 'react';
import {
  saveContentQueue,
  saveNotesMetaQueue,
  saveTasksQueue,
  saveProjectsQueue,
  saveObjectivesQueue,
  saveInboxQueue,
  saveNotesCreatesQueue,
  saveTasksCreatesQueue,
  saveProjectsCreatesQueue,
  saveObjectivesCreatesQueue,
  type SaveQueue,
} from '@/lib/saveQueue';

export type PendingSyncEntityType = 'note' | 'task' | 'project' | 'objective' | 'inboxItem';

export interface PendingSyncStatus {
  isPending: boolean;
  hasError: boolean;
}

// Reusable ref para items sin pendientes — preserva identidad entre llamadas
// para que useSyncExternalStore (Object.is requirement) no re-renderice si
// nada cambió.
const SYNCED_STATUS: PendingSyncStatus = { isPending: false, hasError: false };

// F42.1 D2: items capturados via QuickCaptureProvider con setRow directo
// (path canónico D4 F38.3) NO van a queue. El hook NO los marca como pending —
// limitación documentada, escalable a F43 si surge demanda.
const QUEUES_BY_ENTITY: Record<PendingSyncEntityType, ReadonlyArray<SaveQueue<unknown>>> = {
  note: [
    saveContentQueue as unknown as SaveQueue<unknown>,
    saveNotesMetaQueue as unknown as SaveQueue<unknown>,
    saveNotesCreatesQueue as unknown as SaveQueue<unknown>,
  ],
  task: [
    saveTasksQueue as unknown as SaveQueue<unknown>,
    saveTasksCreatesQueue as unknown as SaveQueue<unknown>,
  ],
  project: [
    saveProjectsQueue as unknown as SaveQueue<unknown>,
    saveProjectsCreatesQueue as unknown as SaveQueue<unknown>,
  ],
  objective: [
    saveObjectivesQueue as unknown as SaveQueue<unknown>,
    saveObjectivesCreatesQueue as unknown as SaveQueue<unknown>,
  ],
  inboxItem: [saveInboxQueue as unknown as SaveQueue<unknown>],
};

// Module-level version: cualquier notify de cualquier queue lo bumpea.
// Subscribers app-lifetime — los queues son singletons, no hay cleanup.
// Mismo patrón que usePendingSyncCount.ts (F30 D-PSC).
let globalVersion = 0;
function bumpVersion(): void {
  globalVersion += 1;
}
const allRelevantQueues = new Set<SaveQueue<unknown>>();
for (const entity of Object.keys(QUEUES_BY_ENTITY) as PendingSyncEntityType[]) {
  for (const queue of QUEUES_BY_ENTITY[entity]) {
    if (!allRelevantQueues.has(queue)) {
      allRelevantQueues.add(queue);
      queue.subscribe(bumpVersion);
    }
  }
}

// Cache per (entityType, id) → mantiene la misma ref status entre versions
// si los valores no cambiaron (evita re-renders innecesarios).
interface CacheEntry {
  version: number;
  status: PendingSyncStatus;
}
const cache = new Map<string, CacheEntry>();

function cacheKey(entityType: PendingSyncEntityType, id: string): string {
  return `${entityType}:${id}`;
}

// Composite keys de saveNotesMetaQueue (notesRepo.ts:313 — `${noteId}:accept-${suggestionId}`)
// requieren prefijo match. Para el resto la key === id raw.
function matchesId(queueKey: string, id: string): boolean {
  return queueKey === id || queueKey.startsWith(`${id}:`);
}

function compute(entityType: PendingSyncEntityType, id: string): PendingSyncStatus {
  let isPending = false;
  let hasError = false;
  for (const queue of QUEUES_BY_ENTITY[entityType]) {
    for (const [key, entry] of queue.getSnapshot()) {
      if (!matchesId(key, id)) continue;
      if (entry.status === 'synced') continue;
      isPending = true;
      if (entry.status === 'error') {
        hasError = true;
        break;
      }
    }
    if (hasError) break;
  }
  return isPending ? { isPending, hasError } : SYNCED_STATUS;
}

function getSnapshot(entityType: PendingSyncEntityType, id: string): PendingSyncStatus {
  const key = cacheKey(entityType, id);
  const cached = cache.get(key);
  if (cached && cached.version === globalVersion) {
    return cached.status;
  }
  const next = compute(entityType, id);
  // Si los valores no cambiaron respecto al cache previo, preservar la ref
  // anterior para que Object.is en useSyncExternalStore evite re-render.
  if (
    cached &&
    cached.status.isPending === next.isPending &&
    cached.status.hasError === next.hasError
  ) {
    cache.set(key, { version: globalVersion, status: cached.status });
    return cached.status;
  }
  cache.set(key, { version: globalVersion, status: next });
  return next;
}

function subscribe(cb: () => void): () => void {
  const unsubs: Array<() => void> = [];
  for (const queue of allRelevantQueues) {
    unsubs.push(queue.subscribe(cb));
  }
  return () => unsubs.forEach((u) => u());
}

export default function usePendingSyncForEntity(
  entityType: PendingSyncEntityType,
  id: string,
): PendingSyncStatus {
  const snapshot = useCallback(() => getSnapshot(entityType, id), [entityType, id]);
  return useSyncExternalStore(subscribe, snapshot);
}
