import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Store } from 'tinybase';

export type RepoRow = Record<string, string | number | boolean>;

export interface RepoConfig {
  store: Store;
  table: string;
  pathFor: (uid: string, id: string) => string;
}

export interface Repo<Row extends RepoRow> {
  create(data: Row, opts?: { id?: string }): Promise<string>;
  update(id: string, partial: Partial<Row>): Promise<void>;
  remove(id: string): Promise<void>;
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('[repo] no auth.currentUser.uid — operación cancelada');
  }
  return uid;
}

export function createFirestoreRepo<Row extends RepoRow>(cfg: RepoConfig): Repo<Row> {
  const { store, table, pathFor } = cfg;

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
      await setDoc(doc(db, pathFor(uid, id)), dataForFirestore, { merge: true });
      return id;
    },

    async update(id, partial) {
      const uid = requireUid();
      // Shallow copy por el mismo motivo que create — TinyBase muta el objeto
      // pasado y los campos no-en-schema se perderían antes del setDoc.
      const partialForFirestore = { ...partial };
      store.setPartialRow(table, id, partial as RepoRow);
      await setDoc(doc(db, pathFor(uid, id)), partialForFirestore, { merge: true });
    },

    async remove(id) {
      const uid = requireUid();
      store.delRow(table, id);
      await deleteDoc(doc(db, pathFor(uid, id)));
    },
  };
}
