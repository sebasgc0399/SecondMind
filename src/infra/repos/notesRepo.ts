import { arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { createFirestoreRepo } from '@/infra/repos/baseRepo';
import { saveNotesMetaQueue } from '@/lib/saveQueue';
import { notesStore } from '@/stores/notesStore';
import { stringifyIds } from '@/lib/tinybase';
import type { NoteType } from '@/types/common';
import type { NoteRow } from '@/types/repoRows';

const repo = createFirestoreRepo<NoteRow>({
  store: notesStore,
  table: 'notes',
  pathFor: (uid, id) => `users/${uid}/notes/${id}`,
  queue: saveNotesMetaQueue,
});

export interface NoteCreateOverrides {
  title?: string;
  contentPlain?: string;
  paraType?: string;
  source?: string;
}

/**
 * Crea una nota vacía. El content (TipTap JSON) se escribe desde
 * useNoteSave al abrir el editor. El caller típicamente hace
 * `await createNote()` antes de `navigate('/notes/{id}')` para respetar
 * el gotcha de ESTADO-ACTUAL: setDoc debe terminar antes de que
 * useNote.getDoc corra en la página destino.
 */
async function createNote(overrides?: NoteCreateOverrides): Promise<string | null> {
  const now = Date.now();
  const defaults: NoteRow = {
    title: overrides?.title ?? '',
    contentPlain: overrides?.contentPlain ?? '',
    paraType: overrides?.paraType ?? 'resource',
    noteType: 'fleeting',
    source: overrides?.source ?? '',
    projectIds: '[]',
    areaIds: '[]',
    tagIds: '[]',
    outgoingLinkIds: '[]',
    incomingLinkIds: '[]',
    linkCount: 0,
    summaryL3: '',
    distillLevel: 0,
    aiTags: '[]',
    aiSummary: '',
    aiProcessed: false,
    createdAt: now,
    updatedAt: now,
    lastViewedAt: 0,
    viewCount: 0,
    isFavorite: false,
    isArchived: false,
    deletedAt: 0,
    fsrsState: '',
    fsrsDue: 0,
    fsrsLastReview: 0,
  };

  try {
    return await repo.create(defaults);
  } catch (error) {
    console.error('[notesRepo] createNote failed', error);
    return null;
  }
}

/**
 * Actualiza metadata de una nota (title, flags, fsrs, tags, etc.).
 * NO persiste `content` — para eso usar saveContent().
 */
async function updateMeta(id: string, partial: Partial<NoteRow>): Promise<void> {
  try {
    await repo.update(id, partial);
  } catch (error) {
    console.error('[notesRepo] updateMeta failed', error);
  }
}

export interface SaveContentPayload {
  content: string; // TipTap JSON serializado — solo a Firestore
  contentPlain: string;
  title: string;
  updatedAt: number;
  summaryL3: string;
  distillLevel: number;
  linkCount: number;
  outgoingLinkIds: string[]; // array JS; serializado internamente
}

/**
 * Persiste content + metadata post-save del editor.
 *
 * Particularidad: `content` (TipTap JSON) vive solo en Firestore, NO en
 * TinyBase (gotcha universal). Este método:
 * 1. setPartialRow sync a TinyBase con todos los campos EXCEPTO content.
 * 2. await setDoc(merge:true) a Firestore con TODOS los campos incluyendo content.
 *
 * F30 D9: usa `setDoc(merge:true)` en lugar de `updateDoc` para tolerar el
 * caso "create del doc aún en queue, doc no existe en server". `updateDoc`
 * fallaría con not-found durante esa ventana; `setDoc(merge)` no exige doc
 * existente y luego converge al CF write (autoTagNote, etc.) sin pisarlos.
 *
 * IMPORTANTE: `outgoingLinkIds` debe pasarse como array. Serialización
 * internamente con `stringifyIds` (no idempotente — no pasar pre-serialized).
 */
async function saveContent(id: string, payload: SaveContentPayload): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('[notesRepo] saveContent: no auth.currentUser.uid');
  }

  const outgoingLinkIdsStr = stringifyIds(payload.outgoingLinkIds);

  // Sync TinyBase (sin content) ANTES del setDoc async.
  notesStore.setPartialRow('notes', id, {
    title: payload.title,
    contentPlain: payload.contentPlain,
    updatedAt: payload.updatedAt,
    linkCount: payload.linkCount,
    outgoingLinkIds: outgoingLinkIdsStr,
    summaryL3: payload.summaryL3,
    distillLevel: payload.distillLevel,
  });

  await setDoc(
    doc(db, `users/${uid}/notes/${id}`),
    {
      content: payload.content,
      contentPlain: payload.contentPlain,
      title: payload.title,
      updatedAt: payload.updatedAt,
      summaryL3: payload.summaryL3,
      distillLevel: payload.distillLevel,
    },
    { merge: true },
  );
}

/**
 * Crea una nota desde un inbox item con contenido pre-populado.
 *
 * Particularidades de este flow (a diferencia de createNote regular):
 * - Construye un docJson TipTap desde rawContent (paragraphs por línea).
 * - Persiste `content` (JSON serializado) en Firestore via el factory; TinyBase
 *   lo ignora porque no está en schema (consistente con el content-split).
 * - Setea `aiProcessed: true` si hay tags del inbox — sin esto, `autoTagNote`
 *   CF sobrescribiría los tags aceptados del usuario (gotcha de ESTADO-ACTUAL).
 * - `tagIds` se pasa ya-serializado como string JSON (no array).
 */
async function createFromInbox(
  rawContent: string,
  overrides: { title: string; tagIds: string[] },
): Promise<string | null> {
  const now = Date.now();
  const docJson = {
    type: 'doc',
    content: rawContent
      .split('\n')
      .map((line) =>
        line.trim()
          ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
          : { type: 'paragraph' },
      ),
  };

  const row = {
    title: overrides.title,
    contentPlain: rawContent,
    paraType: 'resource',
    noteType: 'fleeting',
    source: 'inbox',
    projectIds: '[]',
    areaIds: '[]',
    tagIds: stringifyIds(overrides.tagIds),
    outgoingLinkIds: '[]',
    incomingLinkIds: '[]',
    linkCount: 0,
    summaryL3: '',
    distillLevel: 0,
    aiTags: '[]',
    aiSummary: '',
    aiProcessed: overrides.tagIds.length > 0,
    createdAt: now,
    updatedAt: now,
    lastViewedAt: 0,
    viewCount: 0,
    isFavorite: false,
    isArchived: false,
    deletedAt: 0,
    fsrsState: '',
    fsrsDue: 0,
    fsrsLastReview: 0,
    // content va a Firestore via el factory; TinyBase lo ignora por schema.
    content: JSON.stringify(docJson),
  } as NoteRow & { content: string };

  try {
    return await repo.create(row);
  } catch (error) {
    console.error('[notesRepo] createFromInbox failed', error);
    return null;
  }
}

/**
 * Togglea isFavorite. Lee el row local (TinyBase) para conocer el estado
 * actual y flippearlo. Si la row no existe (caso edge: la lista renderizó
 * algo todavía no hidratado), trata como `false` y la marca favorita.
 */
async function toggleFavorite(id: string): Promise<void> {
  const row = notesStore.getRow('notes', id);
  const current = (row.isFavorite as boolean | undefined) ?? false;
  await repo.update(id, { isFavorite: !current, updatedAt: Date.now() });
}

/**
 * Soft delete: marca la nota como eliminada con timestamp. La nota queda
 * en TinyBase y Firestore — los hooks de lectura (useHybridSearch,
 * useNoteSearch, RecentNotesCard) filtran `deletedAt > 0`.
 */
async function softDelete(id: string): Promise<void> {
  await repo.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

/**
 * Restore: limpia `deletedAt` para que la nota vuelva a aparecer en lecturas.
 */
async function restore(id: string): Promise<void> {
  await repo.update(id, { deletedAt: 0, updatedAt: Date.now() });
}

/**
 * Hard delete: borra la nota permanentemente de TinyBase y Firestore.
 * Wrapper trivial sobre `baseRepo.remove(id)` que respeta el patrón
 * canónico del proyecto sync→async (delRow ANTES de await deleteDoc).
 *
 * Trade-off conocido: si `deleteDoc` falla por red, la row ya desapareció
 * del store local pero el doc sigue en Firestore. El onSnapshot del
 * persister la re-hidrata al reconectar y la nota "reaparece" en la
 * papelera. Para hard delete esto es más confuso que para soft delete,
 * pero respetamos el patrón canónico por consistencia con el resto de
 * repos. El usuario puede reintentar la acción trivialmente.
 *
 * El cleanup de embeddings y links bidireccionales NO se hace acá — lo
 * dispara la CF onNoteDeleted (F3) automáticamente al borrar el doc.
 */
async function hardDelete(id: string): Promise<void> {
  await repo.remove(id);
}

const PURGE_CHUNK_SIZE = 50;

/**
 * Purga masiva: borra permanentemente todas las notas listadas. Chunkea
 * de 50 en 50 con `Promise.allSettled` para evitar saturar quotas de
 * Firestore (cada delete cascadea a F3 con embedding + links cleanup).
 * Rejects de chunks individuales se loggean pero no abortan el resto.
 */
async function purgeAll(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += PURGE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + PURGE_CHUNK_SIZE);
    // removeRaw bypassa el queue: bulk paralelo de 50 deleteDocs chocaria
    // con el LRU cap (50). Acepta el trade-off "best-effort sin retry"
    // porque purgeAll es low-frequency intencional (vaciar papelera).
    const results = await Promise.allSettled(chunk.map((id) => repo.removeRaw(id)));
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.error('[notesRepo] purgeAll: fallaron deletes', {
        chunkStart: i,
        chunkSize: chunk.length,
        failures: failures.length,
      });
    }
  }
}

/**
 * Acepta una sugerencia de promoción de tipo. Aplica el nuevo `noteType`
 * sync a TinyBase (feedback inmediato del banner) y persiste a Firestore
 * agregando el `suggestionId` a `dismissedSuggestions` con `arrayUnion`.
 *
 * `arrayUnion` requiere `updateDoc` directo — `setDoc(merge:true)` del
 * factory NO interpreta el sentinel, así que este helper bypassa
 * intencionalmente `repo.update` para garantizar atomicidad cross-device.
 */
async function acceptSuggestion(
  noteId: string,
  suggestionId: string,
  payload: { noteType: NoteType },
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('[notesRepo] acceptSuggestion: no auth.currentUser.uid');
  }
  // SYNC: TinyBase refleja el flip inmediato para que el banner UI desaparezca.
  notesStore.setPartialRow('notes', noteId, { noteType: payload.noteType });

  // Composite key evita colisión con un updateMeta paralelo del mismo noteId.
  // Trade-off (F29 plan, accept v1): el indicator cuenta entries por queue,
  // no por noteId — si hay updateMeta + acceptSuggestion en flight a la vez,
  // muestra "2 notas pendientes" cuando técnicamente es 1 nota con 2 writes.
  // De-dupe per-id es deuda explícita.
  const queueKey = `${noteId}:accept-${suggestionId}`;
  const docPayload = {
    noteType: payload.noteType,
    dismissedSuggestions: arrayUnion(suggestionId),
    updatedAt: Date.now(),
  };
  // Cast: arrayUnion devuelve un FieldValue opaco al tipo Partial<NoteRow>
  // del queue (que solo lo pasa al executor sin inspeccionarlo).
  saveNotesMetaQueue.enqueue(queueKey, docPayload as unknown as Partial<NoteRow>, async (p) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || currentUid !== uid) {
      throw new Error('[notesRepo] uid changed mid-retry — aborting stale write');
    }
    await updateDoc(doc(db, `users/${uid}/notes/${noteId}`), p);
  });
}

/**
 * Descarta una sugerencia. Persiste el dismiss vía `arrayUnion` para que
 * dos clicks rápidos (o cross-device) no se pisen entre sí.
 */
async function dismissSuggestion(noteId: string, suggestionId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('[notesRepo] dismissSuggestion: no auth.currentUser.uid');
  }
  // dismiss no muta TinyBase (suggestedNoteType vive solo en Firestore por
  // gotcha CF-write-only). Solo encola el updateDoc con arrayUnion al queue
  // de notes con composite key.
  const queueKey = `${noteId}:dismiss-${suggestionId}`;
  const docPayload = {
    dismissedSuggestions: arrayUnion(suggestionId),
    updatedAt: Date.now(),
  };
  saveNotesMetaQueue.enqueue(queueKey, docPayload as unknown as Partial<NoteRow>, async (p) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || currentUid !== uid) {
      throw new Error('[notesRepo] uid changed mid-retry — aborting stale write');
    }
    await updateDoc(doc(db, `users/${uid}/notes/${noteId}`), p);
  });
}

export const notesRepo = {
  createNote,
  createFromInbox,
  updateMeta,
  saveContent,
  toggleFavorite,
  softDelete,
  restore,
  hardDelete,
  purgeAll,
  acceptSuggestion,
  dismissSuggestion,
};
