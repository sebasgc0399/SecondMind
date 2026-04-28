import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { SaveQueue } from '@/lib/saveQueue';
import type { Store } from 'tinybase';

export type RepoRow = Record<string, string | number | boolean>;

export interface RepoConfig<Row extends RepoRow> {
  store: Store;
  table: string;
  pathFor: (uid: string, id: string) => string;
  // Si se pasa, update/remove delegan al queue (sync setRow/delRow ANTES,
  // setDoc/deleteDoc encolado con backoff + uid recheck). Sin queue, el
  // factory mantiene el comportamiento pre-F29 (await directo).
  queue?: SaveQueue<Partial<Row>>;
  // F30: si se pasa, create encola setDoc con backoff + uid recheck en
  // lugar de await directo, retornando el id sync para preservar el
  // contrato `Promise<string>` que asumen los callers (navigate-on-create).
  // Queue dedicado por la regla de upsert collision: un update post-create
  // con misma key reemplazaría el payload entero del create con un partial.
  // Retro-compat: sin createsQueue, comportamiento idéntico a pre-F30.
  createsQueue?: SaveQueue<Row>;
}

export interface Repo<Row extends RepoRow> {
  create(data: Row, opts?: { id?: string }): Promise<string>;
  update(id: string, partial: Partial<Row>): Promise<void>;
  remove(id: string): Promise<void>;
  // Bypass del queue. Uso F29: notesRepo.purgeAll, donde encolar 50
  // deleteDocs paralelos chocaria con el LRU cap (50) del queue.
  removeRaw(id: string): Promise<void>;
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('[repo] no auth.currentUser.uid — operación cancelada');
  }
  return uid;
}

export function createFirestoreRepo<Row extends RepoRow>(cfg: RepoConfig<Row>): Repo<Row> {
  const { store, table, pathFor, queue, createsQueue } = cfg;

  return {
    async create(data, opts) {
      const uid = requireUid();
      const id = opts?.id ?? crypto.randomUUID();
      // Shallow copy ANTES del setRow: TinyBase muta el objeto recibido,
      // removiendo campos no declarados en el schema (ej. `content` en
      // notesRepo.createFromInbox que va a Firestore pero no a TinyBase).
      // Sin la copia, setDoc abajo recibiría el objeto ya mutado y los
      // campos extra nunca llegarían a Firestore.
      const dataForFirestore = { ...data };
      store.setRow(table, id, data);

      if (createsQueue) {
        // F30: encola el setDoc con backoff + uid recheck. Retorna el id
        // sync para preservar el contrato Promise<string> de los callers.
        // Sign-out guard idéntico al de update/remove (G1 paridad F29).
        createsQueue.enqueue(id, dataForFirestore, async (p) => {
          const currentUid = auth.currentUser?.uid;
          if (!currentUid || currentUid !== uid) {
            throw new Error('[repo] uid changed mid-retry — aborting stale write');
          }
          await setDoc(doc(db, pathFor(uid, id)), p, { merge: true });
        });
        return id;
      }
      await setDoc(doc(db, pathFor(uid, id)), dataForFirestore, { merge: true });
      return id;
    },

    async update(id, partial) {
      const uid = requireUid();
      // Shallow copy por el mismo motivo que create — TinyBase muta el objeto
      // pasado y los campos no-en-schema se perderían antes del setDoc.
      const partialForFirestore = { ...partial };
      store.setPartialRow(table, id, partial as RepoRow);

      if (queue) {
        // El executor cierra sobre el uid capturado en este call. Si el user
        // sale e ingresa con otra cuenta mid-retry, recheca y aborta antes
        // de escribir al path stale (mitigación G3, F29 plan).
        queue.enqueue(id, partialForFirestore, async (p) => {
          const currentUid = auth.currentUser?.uid;
          if (!currentUid || currentUid !== uid) {
            throw new Error('[repo] uid changed mid-retry — aborting stale write');
          }
          await setDoc(doc(db, pathFor(uid, id)), p, { merge: true });
        });
        return;
      }
      await setDoc(doc(db, pathFor(uid, id)), partialForFirestore, { merge: true });
    },

    async remove(id) {
      const uid = requireUid();
      store.delRow(table, id);

      if (queue) {
        // Payload sentinel vacío — el executor solo necesita id+uid
        // (capturados en la closure) para emitir deleteDoc.
        queue.enqueue(id, {} as Partial<Row>, async () => {
          const currentUid = auth.currentUser?.uid;
          if (!currentUid || currentUid !== uid) {
            throw new Error('[repo] uid changed mid-retry — aborting stale delete');
          }
          await deleteDoc(doc(db, pathFor(uid, id)));
        });
        return;
      }
      await deleteDoc(doc(db, pathFor(uid, id)));
    },

    async removeRaw(id) {
      const uid = requireUid();
      store.delRow(table, id);
      await deleteDoc(doc(db, pathFor(uid, id)));
    },
  };
}
