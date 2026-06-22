import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireAdmin, adminEmail } from '../lib/requireAdmin';
import { sanitizeError } from '../lib/sanitizeError';
import { decideApproval } from './capacity';
import { appError } from '../lib/appError';
import { sendEmail } from '../email/sendEmail';
import { approvalEmail } from '../email/templates/approval';

// SPEC-65 F1.3 — key del provider de email (Resend). .value() solo dentro del handler.
const resendApiKey = defineSecret('RESEND_API_KEY');

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
    secrets: [adminEmail, resendApiKey],
    timeoutSeconds: 10,
    region: 'us-central1',
    maxInstances: 2,
  },
  async (request) => {
    requireAdmin(request, adminEmail.value());

    const id = request.data?.id;
    const action = request.data?.action;
    if (typeof id !== 'string' || !id.trim()) {
      throw appError('access-request-invalid-id', 'invalid-argument', 'id requerido');
    }
    if (action !== 'approve' && action !== 'reject') {
      throw appError('access-request-invalid-action', 'invalid-argument', 'action inválida');
    }

    try {
      const db = getFirestore();
      const reqRef = db.collection('accessRequests').doc(id);

      if (action === 'reject') {
        // reject no toca capacity ni la allowlist → set simple (sin tx, sin count).
        const snap = await reqRef.get();
        if (!snap.exists) {
          throw appError('access-request-not-found', 'not-found', 'Solicitud no encontrada');
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
          throw appError(
            'access-request-not-found-approve',
            'not-found',
            'Solicitud no encontrada',
          );
        }
        // El doc id YA es el email normalizado; re-normalizamos por robustez — la key de
        // allowlist/ debe matchear token.email lowercase char-por-char (gotcha rules).
        const email = ((snap.data()?.email as string | undefined) ?? id).trim().toLowerCase();
        const allowRef = allowlist.doc(email);
        const alreadyMember = (await tx.get(allowRef)).exists;

        if (!decideApproval({ alreadyMember, current, maxUsers })) {
          throw appError('beta-full', 'resource-exhausted', 'Beta llena', { maxUsers, current });
        }

        const now = FieldValue.serverTimestamp();
        tx.set(allowRef, { addedAt: now }, { merge: true });
        tx.set(reqRef, { status: 'approved', processedAt: now }, { merge: true });
      });

      logger.info('processAccessRequest: ok', { action });

      // SPEC-65 F1.3 — aviso de aprobación, best-effort POST-COMMIT. El approve ya es durable (la
      // tx commiteó); el envío vive en su PROPIO try/catch para que un fallo de Resend (o de la
      // re-lectura / el set del timestamp) NUNCA alcance el catch externo y degrade el { ok: true }
      // a 'internal' (SPEC-65 D2). El email es tx-local (se normaliza dentro de la tx) → se re-lee
      // del doc. Single-send (D1): approvalEmailSentAt se escribe SOLO tras envío OK → si falla
      // queda ausente y un re-approve reintenta; si está, se saltea (a-lo-sumo-una-vez tras éxito).
      // GOTCHA CONSCIENTE: re-leer→enviar→marcar NO es atómico; dos invocaciones concurrentes
      // podrían doble-enviar (ventana de ms). YAGNI para la beta (se aprueba de a uno); fix futuro
      // si sube el volumen = compare-and-set transaccional del timestamp antes de enviar.
      try {
        const approvedSnap = await reqRef.get();
        const data = approvedSnap.data();
        const email = ((data?.email as string | undefined) ?? id).trim().toLowerCase();
        if (data?.status === 'approved' && email && !data?.approvalEmailSentAt) {
          const sent = await sendEmail({
            to: email,
            ...approvalEmail('es'),
            apiKey: resendApiKey.value(),
            // Key estable por postulante (email normalizado) → Resend deduplica server-side (24h):
            // cierra la ventana concurrente que el guard approvalEmailSentAt no cubre. Payload
            // estático (copy fijo) → sin riesgo de 409 invalid_idempotent_request.
            idempotencyKey: `approval/${email}`,
          });
          if (sent.ok) {
            await reqRef.set(
              { approvalEmailSentAt: FieldValue.serverTimestamp() },
              { merge: true },
            );
          }
        }
      } catch (emailError) {
        const { code, message } = sanitizeError(emailError);
        logger.error('processAccessRequest: approval email failed', { code, message });
      }

      return { ok: true };
    } catch (error) {
      // Re-lanzar los HttpsError ya mapeados (not-found, resource-exhausted, etc.) sin
      // degradarlos a 'internal'.
      if (error instanceof HttpsError) throw error;
      const { code, message } = sanitizeError(error);
      logger.error('processAccessRequest: failed', { action, code, message });
      throw appError(
        'process-access-request-failed',
        'internal',
        'No se pudo procesar la solicitud',
      );
    }
  },
);
