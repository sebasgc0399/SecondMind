import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// SPEC-50 F5 (A-2): membresía en la allowlist de la beta cerrada. Lee
// allowlist/{email} con Admin SDK (bypassa el deny-all de F4). Normaliza igual
// que el seed y los puntos cliente: .trim().toLowerCase().
export async function isAllowlisted(email: unknown): Promise<boolean> {
  // email es input NO totalmente confiable: checkMyAccess pasa
  // request.auth.token.email (puede ser undefined si el token no trae email) y
  // assertAllowlisted lo recibe de los callables. Validar ANTES de normalizar: si
  // no es string no-vacío, fail-closed (return false) sin que email.trim() tire
  // TypeError → 500.
  if (typeof email !== 'string' || !email.trim()) return false;
  const normalized = email.trim().toLowerCase();
  const snap = await admin.firestore().collection('allowlist').doc(normalized).get();
  return snap.exists;
}

// Guard para callables ya autenticados (saveApiKey/deleteApiKey): compone en AND
// con requireVerified (F1). Lanza si el email no está en la allowlist.
export async function assertAllowlisted(email: unknown): Promise<void> {
  if (!(await isAllowlisted(email))) {
    throw new HttpsError('permission-denied', 'Email no autorizado para la beta');
  }
}
