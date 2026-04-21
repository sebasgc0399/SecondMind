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
      // sync TinyBase ANTES de async Firestore — el persister con startAutoSave
      // auto-sincroniza como safety-net redundante; el setDoc explícito provee
      // awaitability y orden determinístico. merge:true por consistencia con
      // el persister y defensa ante colisión de IDs.
      store.setRow(table, id, data);
      await setDoc(doc(db, pathFor(uid, id)), data, { merge: true });
      return id;
    },

    async update(id, partial) {
      const uid = requireUid();
      store.setPartialRow(table, id, partial as RepoRow);
      await setDoc(doc(db, pathFor(uid, id)), partial, { merge: true });
    },

    async remove(id) {
      const uid = requireUid();
      store.delRow(table, id);
      await deleteDoc(doc(db, pathFor(uid, id)));
    },
  };
}
