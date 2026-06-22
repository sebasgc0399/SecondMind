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
//
// idempotencyKey (opcional): dedup server-side de Resend (24h). Dos sends con la MISMA key y el
// MISMO payload cuentan como uno; la 2ª llamada concurrente vuelve con un 409 por el campo
// `error` → { ok: false } (no setea timestamp). Cierra la ventana de doble-envío concurrente.

const SEND_TIMEOUT_MS = 10_000;

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  // F2.0: HTML opcional (multipart con `text`). Aditivo — el approval (text-only) no lo usa.
  html?: string;
  apiKey: string;
  idempotencyKey?: string;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  apiKey,
  idempotencyKey,
}: SendEmailParams): Promise<{ ok: boolean; id?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resend = new Resend(apiKey);
    // `html` solo se incluye si está presente (no forzar `html: undefined`); multipart con `text`.
    const payload = { from: getFromHeader(), to, subject, text, ...(html ? { html } : {}) };
    // Solo pasamos el 2º arg si hay key (no forzar { idempotencyKey: undefined }).
    const sendPromise = idempotencyKey
      ? resend.emails.send(payload, { idempotencyKey })
      : resend.emails.send(payload);
    // Evita unhandledRejection si el timeout gana la carrera (el send sigue colgado en bg).
    sendPromise.catch(() => {});

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('resend-timeout')), SEND_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([sendPromise, timeout]);

    if (error) {
      // El error de Resend es plano { name, message } (no Error). Lo normalizamos al shape
      // { code, message } del resto del codebase (saveApiKey/generateEmbedding): code = el
      // discriminador de Resend (p.ej. 'validation_error'). No logear el destinatario (PII).
      logger.error('sendEmail: failed', {
        code: error.name,
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
