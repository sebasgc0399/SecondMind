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
//   - De ahí en más SIEMPRE devuelve { ok: true } pase lo que pase. Razón: generatePasswordResetLink
//     + sendEmail SOLO corren para emails EXISTENTES (el inexistente lanza al generar el link), así
//     que CUALQUIER error posterior está correlacionado con la existencia → burbujearlo daría
//     existente→error vs inexistente→éxito = oráculo. El catch NO se ramifica sobre el código de
//     error: DEPENDE DEL ENTORNO (prod/EEP: auth/internal-error; emulador: auth/email-not-found).
// Costo aceptado: si Resend cae, el user legítimo no tiene señal (ve "te enviamos el email"); el
// único diagnóstico es el logger.error('send failed') de abajo (el catch del generateLink loguea
// WARN, esperado/benigno). Link AL VUELO (oobCode de reset
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
      // ERROR reservado SOLO para el fallo de envío de Resend: el canal de diagnóstico limpio
      // (un Resend caído afecta a usuarios REALES). El cliente igual ve éxito uniforme. Sin PII.
      if (!sent.ok) logger.error('sendResetEmail: send failed', {});
    } catch (err) {
      // Cualquier fallo de generateLink → caso uniforme por anti-enum. El código de error
      // DEPENDE DEL ENTORNO (prod con Email Enumeration Protection: auth/internal-error;
      // emulador de Auth: auth/email-not-found), así que NO se ramifica sobre él — el
      // `return { ok: true }` de abajo garantiza el anti-enum sin importar el code. WARN (no
      // ERROR): un email inexistente es uso normal y NO debe contaminar el canal de 'send failed'.
      const { code, message } = sanitizeError(err);
      logger.warn('sendResetEmail: link generation skipped (uniform anti-enum)', { code, message });
    }
    return { ok: true }; // SIEMPRE uniforme — sin depender del código de error
  },
);
