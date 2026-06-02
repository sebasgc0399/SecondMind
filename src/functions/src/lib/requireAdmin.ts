import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

// SPEC-52 — identidad del admin vía SECRET (no hardcodeada: el repo es público, no
// señalamos el target admin en el código). Mismo patrón que BYOK_MASTER_KEY/OPENAI_API_KEY.
// Setear antes de desplegar las CFs que lo consumen:
//   firebase functions:secrets:set ADMIN_EMAIL
export const adminEmail = defineSecret('ADMIN_EMAIL');

// Gate de los callables admin-only (listAccessRequests / processAccessRequest). Modelo
// email-céntrico (como toda la allowlist): compara el token.email normalizado contra el
// secret. Sync, lee del token, sin I/O (mismo espíritu que requireVerified). El gate REAL
// vive acá (server-side); el gate de la ruta /admin en cliente (VITE_ADMIN_UID) es solo
// cosmético. Fail-closed: si el secret viene vacío o el token no trae email → permission-denied.
export function requireAdmin(request: CallableRequest, expectedEmail: string): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const email = request.auth.token.email;
  if (
    typeof email !== 'string' ||
    !expectedEmail ||
    email.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()
  ) {
    throw new HttpsError('permission-denied', 'No autorizado');
  }
}
