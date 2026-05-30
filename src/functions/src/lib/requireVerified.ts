import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

// A-1 (SPEC-50 F1): exige autenticación Y email verificado al inicio de los
// callables. Criterio idéntico a C1 en firestore.rules:10-14 — email/password
// debe estar verificado; Google marca email_verified=true automáticamente al
// sign-in (D8 F47). Las CFs usan Admin SDK y BYPASSAN las security rules, así
// que sin este gate explícito un usuario no verificado evade C1 por endpoint
// directo. Helper sync: lee del token (request.auth.token), sin lectura Firestore.
export function requireVerified(request: CallableRequest): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const token = request.auth.token;
  const verified =
    token.email_verified === true || token.firebase?.sign_in_provider === 'google.com';
  if (!verified) {
    throw new HttpsError('permission-denied', 'Email no verificado');
  }
  return request.auth.uid;
}
