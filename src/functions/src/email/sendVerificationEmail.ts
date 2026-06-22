import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { enforceRateLimit } from '../lib/rateLimit';
import { appError } from '../lib/appError';
import { sanitizeError } from '../lib/sanitizeError';
import { sendEmail } from './sendEmail';
import { verifyEmail } from './templates/verify';

// SPEC-65 F2.2 — emisor del email de VERIFICACIÓN de cuenta vía Resend (reemplaza el
// sendEmailVerification client-side de Firebase). AUTENTICADA: gate solo `request.auth` (NO
// requireVerified — el user está sin verificar por definición; patrón de checkMyAccess). El
// email se lee del Auth record (fuente de verdad), no del input → no se puede pedir verificación
// para terceros. Link generado AL VUELO (oobCode vence ~3d, single-use; hereda el "customize
// action URL" de la Console → /auth/action). A diferencia del reset, el verify NO tiene anti-enum
// (el user es dueño de su email) → REPORTA el fallo del envío (throw) para que el reenvío del
// cliente conserve la señal "no se pudo, reintentá". SIN idempotencyKey (oobCode fresco por
// llamada; el cooldown 60s del cliente + el rate-limit alcanzan).

const resendApiKey = defineSecret('RESEND_API_KEY');

export const sendVerificationEmail = onCall<unknown, Promise<{ ok: true }>>(
  {
    secrets: [resendApiKey],
    timeoutSeconds: 10,
    region: 'us-central1',
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw appError('verify-unauthenticated', 'unauthenticated', 'Login required');
    }
    const uid = request.auth.uid;
    // Rate-limit por uid: el reenvío es abusable (el cooldown 60s del cliente es la 1ª línea).
    await enforceRateLimit(uid, 'send-verification', { perMinute: 2, perDay: 10 });
    try {
      const email = (await getAuth().getUser(uid)).email;
      if (!email) {
        throw appError('verify-no-email', 'failed-precondition', 'La cuenta no tiene email');
      }
      const link = await getAuth().generateEmailVerificationLink(email);
      const sent = await sendEmail({
        to: email,
        ...verifyEmail(link),
        apiKey: resendApiKey.value(),
      });
      if (!sent.ok) {
        throw appError('verify-send-failed', 'internal', 'No se pudo enviar la verificación');
      }
    } catch (err) {
      // Re-lanzar los HttpsError ya mapeados (verify-no-email / verify-send-failed / rate-limited)
      // sin degradarlos a 'internal' por sanitizeError.
      if (err instanceof HttpsError) throw err;
      const { code, message } = sanitizeError(err);
      logger.error('sendVerificationEmail: failed', { uid, code, message });
      throw appError('verify-send-failed', 'internal', 'No se pudo enviar la verificación');
    }
    return { ok: true };
  },
);
