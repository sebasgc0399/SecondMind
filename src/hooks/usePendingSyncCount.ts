import { useSyncExternalStore } from 'react';
import { allQueues } from '@/lib/saveQueue';

export interface PendingSyncEntity {
  entity: string;
  count: number;
  hasError: boolean;
}

export interface PendingSyncSummary {
  total: number;
  errorCount: number;
  byEntity: PendingSyncEntity[];
  hasAny: boolean;
}

// Labels singular/plural en español. Index alineado con `allQueues`:
// [saveContentQueue, saveNotesMetaQueue, saveTasksQueue, saveProjectsQueue,
//  saveObjectivesQueue, saveHabitsQueue, saveInboxQueue].
const ENTITY_LABELS: ReadonlyArray<{ sing: string; plur: string }> = [
  { sing: 'edición de nota', plur: 'ediciones de nota' },
  { sing: 'nota', plur: 'notas' },
  { sing: 'tarea', plur: 'tareas' },
  { sing: 'proyecto', plur: 'proyectos' },
  { sing: 'objetivo', plur: 'objetivos' },
  { sing: 'hábito', plur: 'hábitos' },
  { sing: 'item de inbox', plur: 'items de inbox' },
];

// Module-level version primitive: cualquier notify de cualquier queue lo
// bumpea. Se cachea el agg derivado por version, asi getSnapshot devuelve
// la misma ref cuando nada cambió (requisito Object.is de useSyncExternalStore
// para evitar re-renders infinitos).
let globalVersion = 0;
function bumpVersion(): void {
  globalVersion += 1;
}
// Subscribers app-lifetime — los queues son singletons, no hay cleanup.
allQueues.forEach((q) => q.subscribe(bumpVersion));

let cachedVersion = -1;
let cachedSummary: PendingSyncSummary = {
  total: 0,
  errorCount: 0,
  byEntity: [],
  hasAny: false,
};

function computeSummary(): PendingSyncSummary {
  const byEntity: PendingSyncEntity[] = [];
  let total = 0;
  let errorCount = 0;
  allQueues.forEach((q, idx) => {
    const snap = q.getSnapshot();
    let count = 0;
    let hasError = false;
    for (const entry of snap.values()) {
      if (entry.status === 'synced') continue;
      count += 1;
      if (entry.status === 'error') {
        hasError = true;
        errorCount += 1;
      }
    }
    total += count;
    if (count > 0) {
      const labels = ENTITY_LABELS[idx]!;
      byEntity.push({
        entity: count === 1 ? labels.sing : labels.plur,
        count,
        hasError,
      });
    }
  });
  return { total, errorCount, byEntity, hasAny: total > 0 };
}

function getSnapshot(): PendingSyncSummary {
  if (cachedVersion !== globalVersion) {
    cachedSummary = computeSummary();
    cachedVersion = globalVersion;
  }
  return cachedSummary;
}

function subscribe(cb: () => void): () => void {
  // Fan-out: cuando cualquier queue notifies, llamar al cb de React (que
  // gatilla re-read de getSnapshot → invalida cache si bumpVersion corrió).
  const unsubs = allQueues.map((q) => q.subscribe(cb));
  return () => unsubs.forEach((u) => u());
}

export default function usePendingSyncCount(): PendingSyncSummary {
  return useSyncExternalStore(subscribe, getSnapshot);
}
