import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireAdmin, adminEmail } from '../lib/requireAdmin';
import { sanitizeError } from '../lib/sanitizeError';

interface ProcessAccessRequestData {
  id?: unknown;
  action?: unknown;
}

// SPEC-52 F4 — aprueba/rechaza una solicitud desde /admin. Admin-only (requireAdmin
// server-side). ÚNICO writer a allowlist/ desde código de app: el Admin SDK bypassa el
// deny-all; la regla allowlist/ sigue `if false` (A-2/A-3 intactos, sin cambios). El
// upsert a allowlist + la marca del request van en un WriteBatch (atómico — evita
// allowlistar sin marcar procesado, o viceversa).
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
      const db = admin.firestore();
      const reqRef = db.collection('accessRequests').doc(id);
      const snap = await reqRef.get();
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Solicitud no encontrada');
      }

      const batch = db.batch();
      const now = admin.firestore.FieldValue.serverTimestamp();

      if (action === 'approve') {
        // El doc id ES el email normalizado; tomamos el campo email por robustez (== id).
        const email = (snap.data()?.email as string | undefined) ?? id;
        batch.set(db.collection('allowlist').doc(email), { addedAt: now }, { merge: true });
        batch.set(reqRef, { status: 'approved', processedAt: now }, { merge: true });
      } else {
        batch.set(reqRef, { status: 'rejected', processedAt: now }, { merge: true });
      }

      await batch.commit();
      logger.info('processAccessRequest: ok', { action });
      return { ok: true };
    } catch (error) {
      // Re-lanzar los HttpsError ya mapeados (not-found, etc.) sin degradarlos a 'internal'.
      if (error instanceof HttpsError) throw error;
      const { code, message } = sanitizeError(error);
      logger.error('processAccessRequest: failed', { action, code, message });
      throw new HttpsError('internal', 'No se pudo procesar la solicitud');
    }
  },
);
