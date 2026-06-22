import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { enforceRateLimit } from '../lib/rateLimit';
import { clientIpHash } from '../lib/clientIp';
import { appError } from '../lib/appError';
import { sanitizeError } from '../lib/sanitizeError';
import { normalizeEmail, isValidEmail } from '../access/submitAccessRequest';
import { sendEmail } from './sendEmail';
import { resetEmail } from './templates/reset';

// SPEC-65 F2.3 — emisor del email de RESET de contraseña vía Resend (reemplaza el
// sendPasswordResetEmail client-side). PÚBLICA (sin auth). ANTI-ENUMERACIÓN ESTRICTA:
//   - Formato inválido + rate-limit se evalúan ANTES del generateLink → agnósticos a la
//     existencia del email → pueden BURBUJEAR sin filtrar nada.
//   - De ahí en más SIEMPRE devuelve { ok: true }. Razón: generatePasswordResetLink + sendEmail
//     SOLO corren para emails EXISTENTES (el inexistente corta en auth/email-not-found), así que
//     CUALQUIER error posterior está correlacionado con la existencia → burbujearlo daría
//     existente→error vs inexistente→éxito = oráculo. La distinción vive solo en los logs.
// Costo aceptado: si Resend cae, el user legítimo no tiene señal (ve "te enviamos el email"); el
// único diagnóstico es el logger.error('send failed') de abajo. Link AL VUELO (oobCode de reset
// vence ~1h, single-use; hereda el "customize action URL" de la Console → /auth/action). SIN
// idempotencyKey (oobCode fresco por llamada).

const resendApiKey = defineSecret('RESEND_API_KEY');

export const sendResetEmail = onCall<{ email?: unknown }, Promise<{ ok: true }>>(
  {
    secrets: [resendApiKey],
    timeoutSeconds: 10,
    region: 'us-central1',
    // Callable PÚBLICA: maxInstances acota costo, el rate-limit por IP acota el total por origen.
    maxInstances: 5,
  },
  async (request) => {
    // 1) Validar formato (agnóstico a la existencia) ANTES del rate-limit: los malformados no
    //    consumen cuota. invalid-argument BURBUJEA (es sobre formato, no membresía → no filtra).
    const raw = request.data?.email;
    if (typeof raw !== 'string' || !raw.trim()) {
      throw appError('reset-invalid-email', 'invalid-argument', 'El email es requerido');
    }
    const email = normalizeEmail(raw);
    if (!isValidEmail(email)) {
      throw appError('reset-invalid-email', 'invalid-argument', 'El email no es válido');
    }
    // 2) Rate-limit por IP (agnóstico a la existencia → puede burbujear como resource-exhausted).
    await enforceRateLimit(clientIpHash(request), 'send-reset', { perMinute: 3, perDay: 10 });

    // 3) De acá en más TODO termina en { ok: true }: el send solo corre para emails existentes,
    //    así que cualquier error post-validación delata la existencia (anti-enum).
    try {
      const link = await getAuth().generatePasswordResetLink(email);
      const sent = await sendEmail({
        to: email,
        ...resetEmail(link),
        apiKey: resendApiKey.value(),
      });
      if (!sent.ok) {
        // Único canal de diagnóstico de esta rama (el cliente ve éxito uniforme). Sin PII.
        logger.error('sendResetEmail: send failed', {});
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // Email no registrado → NO enviar, NO revelar (defensivo: ambos codes posibles; el real en
      // firebase-admin 13.x es auth/email-not-found — verificado en el source + smoke).
      if (code === 'auth/email-not-found' || code === 'auth/user-not-found') {
        logger.info('sendResetEmail: email not found (uniform success)');
      } else {
        const { code: c, message } = sanitizeError(err);
        logger.error('sendResetEmail: failed', { code: c, message }); // sin email (PII)
      }
    }
    return { ok: true }; // SIEMPRE éxito uniforme
  },
);
