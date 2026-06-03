import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireAdmin, adminEmail } from '../lib/requireAdmin';
import { sanitizeError } from '../lib/sanitizeError';
import { decideApproval } from './capacity';

interface ProcessAccessRequestData {
  id?: unknown;
  action?: unknown;
}

// SPEC-52 F4 / SPEC-53 F1 — aprueba/rechaza una solicitud desde /admin. Admin-only
// (requireAdmin server-side). Único writer de ALTA a allowlist/: el Admin SDK bypassa el
// deny-all; la regla allowlist/ sigue `if false` (A-2/A-3 intactos). approve enforce el
// capacity de la beta sobre el tamaño REAL de la allowlist — SPEC-53 mueve el límite a la
// APROBACIÓN (acción admin síncrona), no al signup. Plan B: count() FUERA de la tx (el
// emulador no garantiza aggregation dentro de tx; un solo admin secuencial no genera la race
// que la tx prevendría); el upsert a allowlist + la marca approved van DENTRO de la tx
// (atómico — todo-o-nada). reject no toca capacity → set simple.
export const processAccessRequest = onCall<ProcessAccessRequestData, Promise<{ ok: true }>>(
  {
    secrets: [adminEmail],
    timeoutSeconds: 10,
    region: 'us-central1',
    maxInstances: 2,
  },
  async (request) => {
    requireAdmin(request, adminEmail.value());

    const id = request.data?.id;
    const action = request.data?.action;
    if (typeof id !== 'string' || !id.trim()) {
      throw new HttpsError('invalid-argument', 'id requerido');
    }
    if (action !== 'approve' && action !== 'reject') {
      throw new HttpsError('invalid-argument', 'action inválida');
    }

    try {
      const db = getFirestore();
      const reqRef = db.collection('accessRequests').doc(id);

      if (action === 'reject') {
        // reject no toca capacity ni la allowlist → set simple (sin tx, sin count).
        const snap = await reqRef.get();
        if (!snap.exists) {
          throw new HttpsError('not-found', 'Solicitud no encontrada');
        }
        await reqRef.set(
          { status: 'rejected', processedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        logger.info('processAccessRequest: ok', { action });
        return { ok: true };
      }

      // approve — capacity sobre la allowlist real (Plan B: count() fuera de la tx).
      const allowlist = db.collection('allowlist');
      const current = (await allowlist.count().get()).data().count;
      const rawMax = (await db.doc('config/app').get()).data()?.maxUsers;
      const maxUsers = typeof rawMax === 'number' ? rawMax : 0; // fail-closed si falta

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(reqRef);
        if (!snap.exists) {
          throw new HttpsError('not-found', 'Solicitud no encontrada');
        }
        // El doc id YA es el email normalizado; re-normalizamos por robustez — la key de
        // allowlist/ debe matchear token.email lowercase char-por-char (gotcha rules).
        const email = ((snap.data()?.email as string | undefined) ?? id).trim().toLowerCase();
        const allowRef = allowlist.doc(email);
        const alreadyMember = (await tx.get(allowRef)).exists;

        if (!decideApproval({ alreadyMember, current, maxUsers })) {
          throw new HttpsError('resource-exhausted', 'Beta llena', { maxUsers, current });
        }

        const now = FieldValue.serverTimestamp();
        tx.set(allowRef, { addedAt: now }, { merge: true });
        tx.set(reqRef, { status: 'approved', processedAt: now }, { merge: true });
      });

      logger.info('processAccessRequest: ok', { action });
      return { ok: true };
    } catch (error) {
      // Re-lanzar los HttpsError ya mapeados (not-found, resource-exhausted, etc.) sin
      // degradarlos a 'internal'.
      if (error instanceof HttpsError) throw error;
      const { code, message } = sanitizeError(error);
      logger.error('processAccessRequest: failed', { action, code, message });
      throw new HttpsError('internal', 'No se pudo procesar la solicitud');
    }
  },
);
