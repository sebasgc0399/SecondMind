import { FirebaseError } from 'firebase/app';
import type { SaveContentPayload } from '@/infra/repos/notesRepo';
import type {
  NoteRow,
  TaskRow,
  ProjectRow,
  ObjectiveRow,
  HabitRow,
  InboxRow,
} from '@/types/repoRows';

export type QueueStatus = 'pending' | 'syncing' | 'retrying' | 'synced' | 'error';

export interface QueueEntry<T> {
  payload: T;
  executor: (payload: T) => Promise<void>;
  attempts: number;
  status: QueueStatus;
  lastError: Error | null;
  nextRetryAt: number;
  timerId: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
  createdAt: number;
  version: number;
}

export interface SaveQueue<T> {
  enqueue(id: string, payload: T, executor: (payload: T) => Promise<void>): void;
  cancel(id: string): void;
  retryNow(id: string): void;
  flushAll(): Promise<Map<string, 'synced' | 'failed'>>;
  subscribe(cb: () => void): () => void;
  getEntry(id: string): QueueEntry<T> | undefined;
  getSnapshot(): ReadonlyMap<string, QueueEntry<T>>;
  clear(): void;
  dispose(): void;
}

// Backoff antes del N-ésimo retry. attempts cuenta FALLOS acumulados.
// attempts=1 → delay = RETRY_DELAYS_MS[0] (1s) antes del retry 1.
// attempts=2 → delay = RETRY_DELAYS_MS[1] (2s) antes del retry 2.
// attempts=3 → delay = RETRY_DELAYS_MS[2] (4s) antes del retry 3.
// attempts=4 → status 'error', sin más retries (~7s desde el primer fallo).
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

const PERMANENT_ERROR_CODES = new Set([
  'permission-denied',
  'failed-precondition',
  'invalid-argument',
  'unauthenticated',
]);

const MAX_ENTRIES = 50;
const SYNCED_GC_MS = 100;

export function createSaveQueue<T>(): SaveQueue<T> {
  const entries = new Map<string, QueueEntry<T>>();
  const subscribers = new Set<() => void>();
  let disposed = false;
  let nextVersion = 1;

  function notify(): void {
    subscribers.forEach((cb) => cb());
  }

  function patchEntry(id: string, partial: Partial<QueueEntry<T>>): void {
    const prev = entries.get(id);
    if (!prev) return;
    entries.set(id, { ...prev, ...partial });
  }

  function isPermanentError(err: unknown): boolean {
    return err instanceof FirebaseError && PERMANENT_ERROR_CODES.has(err.code);
  }

  function evictOldestIfFull(): void {
    if (entries.size < MAX_ENTRIES) return;
    let oldestId: string | null = null;
    let oldestCreated = Infinity;
    for (const [id, entry] of entries) {
      if (entry.status === 'syncing') continue;
      if (entry.createdAt < oldestCreated) {
        oldestCreated = entry.createdAt;
        oldestId = id;
      }
    }
    if (!oldestId) return;
    const stale = entries.get(oldestId);
    if (stale?.timerId != null) clearTimeout(stale.timerId);
    entries.delete(oldestId);
  }

  async function executeEntry(id: string): Promise<void> {
    if (disposed) return;
    const entry = entries.get(id);
    if (!entry || entry.cancelled) return;

    const startVersion = entry.version;
    patchEntry(id, { status: 'syncing', timerId: null });
    notify();

    try {
      await entry.executor(entry.payload);
    } catch (err) {
      const current = entries.get(id);
      if (!current || current.cancelled) return;

      // Si hubo un upsert durante el await, el resultado de este intento
      // es irrelevante — ejecutar de nuevo con el payload nuevo.
      if (current.version !== startVersion) {
        void executeEntry(id);
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      const newAttempts = current.attempts + 1;

      if (isPermanentError(err)) {
        patchEntry(id, { status: 'error', attempts: newAttempts, lastError: error });
        notify();
        return;
      }

      if (newAttempts >= MAX_ATTEMPTS) {
        patchEntry(id, { status: 'error', attempts: newAttempts, lastError: error });
        notify();
        return;
      }

      const delay = RETRY_DELAYS_MS[newAttempts - 1];
      if (delay === undefined) {
        // Defensivo: newAttempts ya pasó el guard MAX_ATTEMPTS arriba; no debería
        // entrar acá nunca. Tratar como error final por seguridad.
        patchEntry(id, { status: 'error', attempts: newAttempts, lastError: error });
        notify();
        return;
      }
      const timerId = setTimeout(() => {
        void executeEntry(id);
      }, delay);

      patchEntry(id, {
        status: 'retrying',
        attempts: newAttempts,
        lastError: error,
        nextRetryAt: Date.now() + delay,
        timerId,
      });
      notify();
      return;
    }

    const current = entries.get(id);
    if (!current || current.cancelled) return;

    // Si hubo un upsert durante el await, el éxito de este intento es del
    // payload viejo — re-ejecutar con el payload nuevo antes de marcar synced.
    if (current.version !== startVersion) {
      void executeEntry(id);
      return;
    }

    patchEntry(id, { status: 'synced', lastError: null });
    notify();

    setTimeout(() => {
      const final = entries.get(id);
      if (final && final.status === 'synced' && final.version === startVersion) {
        entries.delete(id);
        notify();
      }
    }, SYNCED_GC_MS);
  }

  function enqueue(id: string, payload: T, executor: (payload: T) => Promise<void>): void {
    if (disposed) return;

    const existing = entries.get(id);
    if (existing) {
      // Upsert: cancela timer en vuelo, reemplaza payload + executor, bump version.
      // Si el executor está en vuelo, el await termina y consulta version → re-ejecuta.
      if (existing.timerId != null) clearTimeout(existing.timerId);

      const wasError = existing.status === 'error';
      const wasSyncing = existing.status === 'syncing';

      entries.set(id, {
        ...existing,
        payload,
        executor,
        timerId: null,
        cancelled: false,
        // wasError: el banner se cerró sin user action explícita (raro si useNoteSave
        // bloquea enqueue mientras error, pero defensivo). Reset attempts a 0.
        attempts: wasError ? 0 : existing.attempts,
        lastError: null,
        nextRetryAt: 0,
        // syncing → mantener; el await en vuelo es responsable de re-ejecutar via version check.
        // pending/retrying/error/synced → forzar 'pending' para próximo run.
        status: wasSyncing ? 'syncing' : 'pending',
        version: ++nextVersion,
      });

      notify();
      if (!wasSyncing) void executeEntry(id);
      return;
    }

    evictOldestIfFull();
    entries.set(id, {
      payload,
      executor,
      attempts: 0,
      status: 'pending',
      lastError: null,
      nextRetryAt: 0,
      timerId: null,
      cancelled: false,
      createdAt: Date.now(),
      version: ++nextVersion,
    });
    notify();
    void executeEntry(id);
  }

  function cancel(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    if (entry.timerId != null) clearTimeout(entry.timerId);
    // Mutar flag — si executor in-flight, lo lee al resolver y aborta el setStatus.
    entry.cancelled = true;
    entries.delete(id);
    notify();
  }

  function retryNow(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    if (entry.timerId != null) clearTimeout(entry.timerId);
    patchEntry(id, {
      attempts: 0,
      status: 'pending',
      lastError: null,
      nextRetryAt: 0,
      timerId: null,
      cancelled: false,
      version: ++nextVersion,
    });
    notify();
    void executeEntry(id);
  }

  async function flushAll(): Promise<Map<string, 'synced' | 'failed'>> {
    const result = new Map<string, 'synced' | 'failed'>();
    const ids = [...entries.keys()];

    await Promise.all(
      ids.map(async (id) => {
        const entry = entries.get(id);
        if (!entry) return;

        if (entry.status === 'synced') {
          result.set(id, 'synced');
          return;
        }
        if (entry.status === 'error') {
          result.set(id, 'failed');
          return;
        }

        if (entry.timerId != null) {
          clearTimeout(entry.timerId);
          patchEntry(id, { timerId: null });
        }

        try {
          await entry.executor(entry.payload);
          const current = entries.get(id);
          if (!current || current.cancelled) {
            result.set(id, 'failed');
            return;
          }
          patchEntry(id, { status: 'synced', lastError: null });
          result.set(id, 'synced');
        } catch (err) {
          const current = entries.get(id);
          if (!current || current.cancelled) {
            result.set(id, 'failed');
            return;
          }
          const error = err instanceof Error ? err : new Error(String(err));
          patchEntry(id, { status: 'error', lastError: error });
          result.set(id, 'failed');
        }
      }),
    );
    notify();
    return result;
  }

  function subscribe(cb: () => void): () => void {
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }

  function getEntry(id: string): QueueEntry<T> | undefined {
    return entries.get(id);
  }

  function getSnapshot(): ReadonlyMap<string, QueueEntry<T>> {
    return entries;
  }

  // clear() vacía las entries pero deja el queue vivo para futuros enqueues.
  // Diferente de dispose() que setea `disposed = true` y silencia enqueues
  // posteriores. Casos de uso: limpieza entre tests + acción "Descartar
  // todo" del PendingSyncIndicator.
  function clear(): void {
    for (const entry of entries.values()) {
      if (entry.timerId != null) clearTimeout(entry.timerId);
    }
    entries.clear();
    notify();
  }

  function dispose(): void {
    disposed = true;
    for (const entry of entries.values()) {
      if (entry.timerId != null) clearTimeout(entry.timerId);
    }
    entries.clear();
    subscribers.clear();
  }

  return {
    enqueue,
    cancel,
    retryNow,
    flushAll,
    subscribe,
    getEntry,
    getSnapshot,
    clear,
    dispose,
  };
}

export const saveContentQueue: SaveQueue<SaveContentPayload> = createSaveQueue();

// F29 — Singletons de retry queue por entidad. Cada queue es independiente;
// el factory `createFirestoreRepo` (baseRepo.ts) inyecta el queue
// correspondiente para que update/remove deleguen el setDoc/deleteDoc
// retry-protected. Bypasses de notesRepo (acceptSuggestion, dismissSuggestion)
// reusan saveNotesMetaQueue con keys compuestas.
export const saveNotesMetaQueue: SaveQueue<Partial<NoteRow>> = createSaveQueue();
export const saveTasksQueue: SaveQueue<Partial<TaskRow>> = createSaveQueue();
export const saveProjectsQueue: SaveQueue<Partial<ProjectRow>> = createSaveQueue();
export const saveObjectivesQueue: SaveQueue<Partial<ObjectiveRow>> = createSaveQueue();
export const saveHabitsQueue: SaveQueue<Partial<HabitRow>> = createSaveQueue();
export const saveInboxQueue: SaveQueue<Partial<InboxRow>> = createSaveQueue();

// Iterables para hooks/UI.
// metaQueues = los 6 nuevos de F29 (sin saveContentQueue).
// allQueues = los 7 totales (saveContent + meta), para flush/aggregator.
export const metaQueues = [
  saveNotesMetaQueue,
  saveTasksQueue,
  saveProjectsQueue,
  saveObjectivesQueue,
  saveHabitsQueue,
  saveInboxQueue,
] as const;

export const allQueues = [saveContentQueue, ...metaQueues] as const;
