import { createCustomPersister } from 'tinybase/persisters';
import {
  collection,
  deleteDoc,
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
    // TinyBase v8 y emite setDoc/deleteDoc solo para las rows tocadas en la
    // transacción. Reemplaza el patrón anterior que iteraba todas las rows
    // de la tabla en cada save (write amplification O(N) → O(cambios)).
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
      if (tableChanges === undefined) return; // tabla intacta este tick

      // tableChanges == null ⇒ store.delTable(). F11 garantiza destroy() antes
      // de delTable en el cleanup de useStoreInit, así que en producción este
      // path no debe ejecutarse. Defensa: warn + return. No intentamos enumerar
      // IDs para borrar masivamente porque getContent() ya no los tiene tras
      // delTable; un getDocs(col) extra solo serviría si delTable se llamara
      // con persister vivo, escenario que F11 evita por diseño.
      if (tableChanges == null) {
        console.warn(
          `[persister:${tableName}] tableChanges=${tableChanges} inesperado tras destroy()`,
        );
        return;
      }

      const [tablesContent] = getContent();
      const rowsContent =
        (tablesContent as Record<string, Record<string, StoreRow>>)[tableName] ?? {};

      // Promise.allSettled (NO Promise.all): cada write completa independiente.
      // Con Promise.all, el primer reject hace que el await retorne sin esperar
      // a las demás promesas (que sí siguen en vuelo, sin observación). Un
      // deleteDoc fallido no debe abortar un setDoc OK del mismo tick.
      const results = await Promise.allSettled(
        Object.entries(tableChanges).map(([rowId, rowChanges]) => {
          // rowChanges == null ⇒ row eliminada (delRow / setRow con undefined).
          // El TYPE de Changes solo permite undefined pero el JSDoc usa null
          // como ejemplo; doble-igual cubre ambos.
          if (rowChanges == null) {
            return deleteDoc(doc(col, rowId));
          }
          // merge: true preserva campos escritos fuera de TinyBase (ej. `content`
          // en notas, que se escribe directo con updateDoc desde useNoteSave).
          // Escribimos el row entero (no cells parciales) — bytes equivalentes
          // y menos código que reconstruir desde cell-changes.
          const fullRow = rowsContent[rowId];
          if (!fullRow) {
            // Edge defensivo: change reporta row pero getContent no la tiene
            // (race teórico) → tratar como delete.
            return deleteDoc(doc(col, rowId));
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
