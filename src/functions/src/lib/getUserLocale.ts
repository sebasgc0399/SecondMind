import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { sanitizeError } from './sanitizeError';

// F3.1 (SPEC-58): locale del usuario para localizar el output de la AI
// (processInboxItem / autoTagNote). Los triggers Firestore NO reciben el locale
// como argumento → se LEE server-side de users/{uid}/settings/preferences.
export type Locale = 'es' | 'en';

const DEFAULT_LOCALE: Locale = 'es';

/**
 * Normaliza el valor crudo del campo `locale` del doc de preferences.
 * Todos los caminos caen a 'es': `null` (nunca elegido), campo ausente
 * (usuarios pre-F1.3), o valor inválido. Pura (sin I/O) → unit-testable.
 */
export function parseLocale(raw: unknown): Locale {
  return raw === 'es' || raw === 'en' ? raw : DEFAULT_LOCALE;
}

/**
 * Lee el locale del usuario desde users/{uid}/settings/preferences (Admin SDK).
 * Default 'es' ante !exists / campo ausente / null / inválido / error de read.
 *
 * NUNCA lanza: un fallo leyendo preferences no debe afectar el flujo de la CF
 * (en particular, NO debe disparar la invalidación de la key BYOK del catch
 * principal). Patrón del read: autoPurgeTrash.ts (get + exists + default).
 */
export async function getUserLocale(userId: string): Promise<Locale> {
  try {
    const snap = await admin.firestore().doc(`users/${userId}/settings/preferences`).get();
    return parseLocale(snap.exists ? snap.data()?.locale : null);
  } catch (error) {
    const { code, message } = sanitizeError(error);
    logger.warn('getUserLocale: read falló, default es', { userId, code, message });
    return DEFAULT_LOCALE;
  }
}
