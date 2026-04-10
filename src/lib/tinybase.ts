import { createCustomPersister } from 'tinybase/persisters';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { notesStore } from '@/stores/notesStore';

type NoteRow = Record<string, string | number | boolean>;

export async function initPersister(userId: string) {
  const notesCol = collection(db, `users/${userId}/notes`);

  // Holds the Firestore onSnapshot unsubscribe fn between add/del listener calls
  let firestoreUnsubscribe: (() => void) | undefined;

  const persister = createCustomPersister(
    notesStore,

    // getPersisted: load all Firestore docs into TinyBase table format
    async () => {
      const snapshot = await getDocs(notesCol);
      const notes: Record<string, NoteRow> = {};
      snapshot.forEach((docSnap) => {
        notes[docSnap.id] = docSnap.data() as NoteRow;
      });
      return [{ notes }, {}] as const;
    },

    // setPersisted: write each store row as a Firestore document
    async (getContent) => {
      const [tables] = getContent();
      const rows = (tables as Record<string, Record<string, NoteRow>>)['notes'] ?? {};
      await Promise.all(
        Object.entries(rows).map(([id, row]) => setDoc(doc(notesCol, id), row)),
      );
    },

    // addPersisterListener: set up real-time Firestore listener
    (didChange) => {
      firestoreUnsubscribe = onSnapshot(notesCol, () => didChange());
    },

    // delPersisterListener: tear down the Firestore listener
    () => {
      firestoreUnsubscribe?.();
      firestoreUnsubscribe = undefined;
    },
  );

  await persister.startAutoLoad();
  await persister.startAutoSave();

  return persister;
}
