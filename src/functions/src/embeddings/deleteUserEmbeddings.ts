import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { sanitizeError } from '../lib/sanitizeError';

const BATCH_LIMIT = 500; // límite de ops por WriteBatch (Firestore)

// SPEC-66 F7 — borra TODOS los embeddings de un usuario (`users/{uid}/embeddings/*`).
// Función PURA y reusable: la usan (1) el trigger de desactivación (D4-D-B,
// abajo) y (2) el script de migración de usuarios existentes (F8, D3-M-C) — una
// sola fuente de verdad para purgar. Paginada (nunca carga más de BATCH_LIMIT
// en memoria) → escala a corpus grandes. Idempotente: el delete es no-op sobre
// lo ya borrado, así que retry es seguro. Devuelve cuántos borró (para el log).
export async function deleteAllUserEmbeddings(uid: string): Promise<number> {
  if (typeof uid !== 'string' || !uid) return 0;
  const db = admin.firestore();
  const coll = db.collection(`users/${uid}/embeddings`);

  let total = 0;
  // Loop hasta vaciar: traemos una página de ≤500, la borramos en un batch, y
  // seguimos. Cuando una página vuelve incompleta (< límite) ya no quedan más.
  for (;;) {
    const snap = await coll.limit(BATCH_LIMIT).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < BATCH_LIMIT) break;
  }
  return total;
}

// Dependencia inyectable para test (el borrado real vs un spy).
export interface ConsentChangeDeps {
  deleteEmbeddings: (uid: string) => Promise<number>;
}

const defaultDeps: ConsentChangeDeps = { deleteEmbeddings: deleteAllUserEmbeddings };

// Estructura mínima del evento (params + before/after.data()). `onDocumentWritten`
// pasa un FirestoreEvent estructuralmente compatible; el test fabrica este shape.
interface ConsentChangeEvent {
  params: { userId: string };
  data?: {
    before?: { data: () => Record<string, unknown> | undefined };
    after?: { data: () => Record<string, unknown> | undefined };
  };
}

export async function handleSemanticConsentChange(
  event: ConsentChangeEvent,
  deps: ConsentChangeDeps = defaultDeps,
): Promise<void> {
  const { userId } = event.params;
  const wasEnabled = event.data?.before?.data()?.enabled === true;
  const isEnabled = event.data?.after?.data()?.enabled === true;

  // SPEC-66 F7/D4-D-B — purga SOLO en la transición enabled true→false (incluye
  // que el doc se borre: after.enabled deja de ser true). Coherente con "apago
  // para no exponer mis datos" (los embeddings son invertibles, no anónimos).
  // Cualquier otra transición (activar, sin cambio, ya-deshabilitado) → no-op —
  // así evitamos borrar al activar, loops, o borrar en el primer reconocimiento.
  if (!(wasEnabled && !isEnabled)) return;

  try {
    const deleted = await deps.deleteEmbeddings(userId);
    logger.info('onSemanticConsentChanged: purged embeddings on disable', { userId, deleted });
  } catch (error) {
    const { code, message } = sanitizeError(error);
    logger.error('onSemanticConsentChanged: purge failed', { userId, code, message });
    throw error; // retry:true reintenta (idempotente)
  }
}

export const onSemanticConsentChanged = onDocumentWritten(
  {
    document: 'users/{userId}/settings/semanticSearch',
    region: 'us-central1',
    timeoutSeconds: 120,
    // Idempotente (el delete es re-ejecutable): retry seguro ante fallo transitorio,
    // crítico para garantizar la purga legal aunque el cliente se haya desconectado.
    retry: true,
  },
  (event) => handleSemanticConsentChange(event),
);
