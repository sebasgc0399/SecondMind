import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { isAllowlisted } from '../lib/assertAllowlisted';

interface CheckMyAccessResponse {
  authorized: boolean;
}

// SPEC-51 F1 (A-3): reemplaza el callable PÚBLICO checkAllowlist (que era un
// oráculo de enumeración 1-a-1). AUTENTICADO: lee el email del PROPIO token
// (request.auth.token.email) e IGNORA cualquier input → solo se puede preguntar
// "¿yo tengo acceso?", no enumerar emails de terceros. NO exige email_verified
// (D2): es best-effort UX para el gate post-auth (email/pw recién creado todavía
// no está verificado al correr el gate). El backstop real son las security rules
// (users/** exige verified + allowlist). Normalización (trim+lowercase) y
// fail-closed (false si el email no es string) los maneja isAllowlisted.
export const checkMyAccess = onCall<unknown, Promise<CheckMyAccessResponse>>(
  {
    timeoutSeconds: 10,
    region: 'us-central1',
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }
    return { authorized: await isAllowlisted(request.auth.token.email) };
  },
);
