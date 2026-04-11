import { createCustomPersister } from 'tinybase/persisters';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Store } from 'tinybase';

type StoreRow = Record<string, string | number | boolean>;

interface FirestorePersisterConfig {
  store: Store;
  collectionPath: string;
  tableName: string;
}

// Errores esperados al sign out: el listener sigue activo unos ms tras
// cerrar sesión y Firestore responde con permission-denied. No son bugs.
const SILENT_ERROR_CODES = new Set(['permission-denied', 'unauthenticated']);

function handleListenerError(tableName: string, error: FirestoreError) {
  if (SILENT_ERROR_CODES.has(error.code)) return;
  console.error(`[persister:${tableName}] listener error`, error);
}

export function createFirestorePersister({
  store,
  collectionPath,
  tableName,
}: FirestorePersisterConfig) {
  const col = collection(db, collectionPath);
  let firestoreUnsubscribe: (() => void) | undefined;

  return createCustomPersister(
    store,

    async () => {
      const snapshot = await getDocs(col);
      const rows: Record<string, StoreRow> = {};
      snapshot.forEach((docSnap) => {
        rows[docSnap.id] = docSnap.data() as StoreRow;
      });
      return [{ [tableName]: rows }, {}] as const;
    },

    async (getContent) => {
      const [tables] = getContent();
      const rows = (tables as Record<string, Record<string, StoreRow>>)[tableName] ?? {};
      await Promise.all(Object.entries(rows).map(([id, row]) => setDoc(doc(col, id), row)));
    },

    (didChange) => {
      firestoreUnsubscribe = onSnapshot(
        col,
        () => didChange(),
        (error) => handleListenerError(tableName, error),
      );
    },

    () => {
      firestoreUnsubscribe?.();
      firestoreUnsubscribe = undefined;
    },
  );
}

export function parseIds(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function stringifyIds(ids: string[]): string {
  return JSON.stringify(ids);
}
