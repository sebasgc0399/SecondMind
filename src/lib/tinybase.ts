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

function isSilentError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    SILENT_ERROR_CODES.has((err as { code: string }).code)
  );
}

function handleListenerError(tableName: string, error: FirestoreError) {
  if (isSilentError(error)) return;
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

    // setPersisted diff-based (F12): consume el param `changes` nativo de
    // TinyBase v8 y emite setDoc solo para las rows tocadas en la transacción.
    // Reemplaza el patrón anterior que iteraba todas las rows de la tabla en
    // cada save (write amplification O(N) → O(cambios)).
    //
    // LIMITACIÓN TinyBase v8: el param `changes` NO incluye los row IDs
    // eliminados — `delRow` standalone deja `changes = [{}, {}, 1]` sin
    // info del delete; `delTable` igual. Por eso F12 NO propaga deletes a
    // Firestore. En producción esto es inocuo: todos los deletes pasan por
    // repos (F10) que hacen `deleteDoc` directo. Si alguien llama
    // `store.delRow` sin pasar por un repo, el doc queda huérfano en
    // Firestore — patrón a evitar (no es invariante de F12, era cierto pre-F12
    // también según el gotcha original de F11).
    async (getContent, changes) => {
      // Sin changes: típicamente primer tick post-startAutoLoad (sin cambios
      // pendientes, solo carga). Validado empíricamente en F12 step 1.
      // Skip + debug log en dev para detectar regresiones futuras (si una
      // nueva ruta empieza a llamar sin changes con datos reales, lo veremos).
      if (!changes) {
        if (import.meta.env.DEV) {
          console.debug(`[persister:${tableName}] setPersisted sin changes — skip`);
        }
        return;
      }

      const [changedTables] = changes;
      const tableChanges = changedTables[tableName];
      // undefined ⇒ tabla intacta este tick. {} ⇒ TinyBase emite cuando hubo
      // un delete pero no incluye qué row (limitación v8). null defensivo
      // contra runtime divergence (TYPE permite solo undefined, JSDoc usa
      // null como ejemplo). Ninguno requiere acción del persister.
      if (tableChanges == null || Object.keys(tableChanges).length === 0) {
        return;
      }

      const [tablesContent] = getContent();
      const rowsContent =
        (tablesContent as Record<string, Record<string, StoreRow>>)[tableName] ?? {};

      // Promise.allSettled (NO Promise.all): cada write completa independiente.
      // Con Promise.all, el primer reject hace que el await retorne sin esperar
      // a las demás promesas (que sí siguen en vuelo, sin observación). Un
      // setDoc fallido no debe abortar otros setDocs OK del mismo tick.
      const results = await Promise.allSettled(
        Object.entries(tableChanges).map(([rowId]) => {
          // merge: true preserva campos escritos fuera de TinyBase (ej. `content`
          // en notas, que se escribe directo con updateDoc desde useNoteSave).
          // Escribimos el row entero (no cells parciales) — bytes equivalentes
          // y menos código que reconstruir desde cell-changes.
          const fullRow = rowsContent[rowId];
          if (!fullRow) {
            // Defensivo: change reporta row pero getContent no la tiene.
            // No emitimos deleteDoc (TinyBase no garantiza este shape post-delete);
            // skip y dejar el doc en Firestore (consistente con la limitación arriba).
            return Promise.resolve();
          }
          return setDoc(doc(col, rowId), fullRow, { merge: true });
        }),
      );

      // Recolectar y reportar rejects. Filtrar errores benignos del logout
      // con isSilentError. Re-throw al final para que onIgnoredError reciba
      // la señal — TinyBase NO reintenta automáticamente; las rows fallidas
      // quedan eventualmente consistentes solo cuando vuelven a tocarse.
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => r.reason as unknown);

      for (const err of errors) {
        if (!isSilentError(err)) {
          console.error(`[persister:${tableName}] write failed`, err);
        }
      }

      if (errors.length > 0) {
        throw errors.length === 1
          ? errors[0]
          : new AggregateError(errors, `[persister:${tableName}] ${errors.length} writes failed`);
      }
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

    // onIgnoredError (6º arg, opcional): TinyBase entrega aquí los errores
    // del setPersisted/getPersisted que no causan crash de la app. Sin este
    // hook, los rejects del setPersisted quedan completamente silenciosos.
    (error: unknown) => {
      if (!isSilentError(error)) {
        console.error(`[persister:${tableName}] ignored persister error`, error);
      }
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
