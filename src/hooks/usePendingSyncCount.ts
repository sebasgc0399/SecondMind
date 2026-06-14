import { useSyncExternalStore } from 'react';
import { allQueues } from '@/lib/saveQueue';

export interface PendingSyncEntity {
  // Index alineado con `allQueues`. El label (sing/plur) lo resuelve el
  // consumidor con usePendingSyncLabels()[entityIndex] según el count.
  entityIndex: number;
  count: number;
  hasError: boolean;
}

export interface PendingSyncSummary {
  total: number;
  errorCount: number;
  byEntity: PendingSyncEntity[];
  hasAny: boolean;
}

// `byEntity[].entityIndex` está alineado con el orden de `allQueues`:
// [saveContentQueue, saveNotesMetaQueue, saveTasksQueue, saveProjectsQueue,
//  saveObjectivesQueue, saveHabitsQueue, saveInboxQueue,
//  saveNotesCreatesQueue, saveTasksCreatesQueue, saveProjectsCreatesQueue,
//  saveObjectivesCreatesQueue]. Los labels sing/plur viven en
// buildPendingSyncLabels (src/lib/entityLabels.ts) y se resuelven en render
// (F2.7: desacopla el label del idioma del boot — i18n.t a module-scope acá
// lo congelaría).
//
// F30 D8: distinción semántica entre "edición/nota" (meta updates pendientes,
// índice 1) y "nota nueva" (creates pendientes, índice 7). El popover muestra
// ambos por separado.

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

// Composite keys en `saveNotesMetaQueue`: `${noteId}:accept-${suggestionId}` y
// `${noteId}:dismiss-${suggestionId}` (notesRepo.ts:313, :342). Para el resto
// de queues la key === entityId raw, por lo que extractEntityId es no-op
// (`indexOf(':') === -1` → retorna la key entera).
//
// Asunción: entityIds (noteId/taskId/projectId/etc.) son UUIDs v4 generados
// por crypto.randomUUID() que NO contienen ':'. Si una entidad futura adopta
// IDs nativos con ':', escalar a un mapa explícito (queue → keyParser).
function extractEntityId(queueKey: string): string {
  const colonIdx = queueKey.indexOf(':');
  return colonIdx === -1 ? queueKey : queueKey.slice(0, colonIdx);
}

function computeSummary(): PendingSyncSummary {
  const byEntity: PendingSyncEntity[] = [];
  let total = 0;
  let errorCount = 0;
  allQueues.forEach((q, idx) => {
    const snap = q.getSnapshot();
    const pendingIds = new Set<string>();
    const errorIds = new Set<string>();
    for (const [key, entry] of snap) {
      if (entry.status === 'synced') continue;
      const entityId = extractEntityId(key);
      pendingIds.add(entityId);
      if (entry.status === 'error') errorIds.add(entityId);
    }
    const count = pendingIds.size;
    if (count === 0) return;
    total += count;
    errorCount += errorIds.size;
    byEntity.push({
      entityIndex: idx,
      count,
      hasError: errorIds.size > 0,
    });
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
