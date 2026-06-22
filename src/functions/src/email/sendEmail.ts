import { Resend } from 'resend';
import { logger } from 'firebase-functions';
import { sanitizeError } from '../lib/sanitizeError';
import { getFromHeader } from './from';

// SPEC-65 F1.2 — wrapper de envío sobre Resend. NUNCA throwea: devuelve { ok } para que el
// caller (ej. processAccessRequest post-commit) trate el envío como best-effort y un fallo
// jamás rompa el flujo que lo dispara (SPEC-65 D2).
//
// Dos capas de fallo que tragamos:
//  1. El SDK de Resend NO throwea ante errores de API (4xx/5xx/rate-limit): devuelve
//     { data, error }. Branqueamos en `error` explícitamente (un branch solo-excepción
//     trataría un 401/429 como éxito). OJO: el `error` de Resend es un objeto plano
//     { name, message }, NO un Error → se lee directo (sanitizeError solo extrae de Error).
//  2. Cuelgue de transporte: el SDK no expone timeout/AbortSignal, así que acotamos con un
//     Promise.race a SEND_TIMEOUT_MS — un Resend lento NO debe bloquear el handler (el approve
//     ya es durable). El send perdedor se deja morir con un .catch noop + clearTimeout.

const SEND_TIMEOUT_MS = 10_000;

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  apiKey: string;
}

export async function sendEmail({
  to,
  subject,
  text,
  apiKey,
}: SendEmailParams): Promise<{ ok: boolean; id?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resend = new Resend(apiKey);
    const sendPromise = resend.emails.send({ from: getFromHeader(), to, subject, text });
    // Evita unhandledRejection si el timeout gana la carrera (el send sigue colgado en bg).
    sendPromise.catch(() => {});

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('resend-timeout')), SEND_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([sendPromise, timeout]);

    if (error) {
      // No logear el destinatario (PII). El message de Resend describe el fallo, no el contenido.
      logger.error('sendEmail: failed', {
        name: error.name,
        message: (error.message ?? '').slice(0, 200),
      });
      return { ok: false };
    }
    logger.info('sendEmail: ok', { id: data?.id });
    return { ok: true, id: data?.id };
  } catch (err) {
    // Timeout o throw de transporte → best-effort, nunca propaga.
    const { code, message } = sanitizeError(err);
    logger.error('sendEmail: failed', { code, message });
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
