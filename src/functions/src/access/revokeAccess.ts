import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAdmin, adminEmail } from '../lib/requireAdmin';
import { sanitizeError } from '../lib/sanitizeError';

interface RevokeAccessData {
  email?: unknown;
}

// SPEC-53 F3 — revoca el acceso de un miembro: borra allowlist/{email}. Admin-only
// (requireAdmin server-side). PRIMER writer de BORRADO a allowlist/ (la regla deny-all no
// cambia — el Admin SDK la bypassa). Soft revoke (D3): no desloguea ni borra cuenta/datos; la
// sesión activa cae al próximo gate (las rules deniegan I/O; checkMyAccess falla en el próximo
// login). Idempotente: borrar un email que no está = ok. Normaliza igual que el alta
// (trim+lowercase) para matchear la key del doc.
export const revokeAccess = onCall<RevokeAccessData, Promise<{ ok: true }>>(
  {
    secrets: [adminEmail],
    timeoutSeconds: 10,
    region: 'us-central1',
    maxInstances: 2,
  },
  async (request) => {
    requireAdmin(request, adminEmail.value());

    const email = request.data?.email;
    if (typeof email !== 'string' || !email.trim()) {
      throw new HttpsError('invalid-argument', 'email requerido');
    }
    const normalized = email.trim().toLowerCase();

    try {
      await getFirestore().collection('allowlist').doc(normalized).delete();
      logger.info('revokeAccess: ok');
      return { ok: true };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const { code, message } = sanitizeError(error);
      logger.error('revokeAccess: failed', { code, message });
      throw new HttpsError('internal', 'No se pudo revocar el acceso');
    }
  },
);
