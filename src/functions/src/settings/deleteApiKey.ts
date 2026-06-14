import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireVerified } from '../lib/requireVerified';
import { assertAllowlisted } from '../lib/assertAllowlisted';
import { sanitizeError } from '../lib/sanitizeError';
import { appError } from '../lib/appError';

interface DeleteApiKeyRequest {
  provider: string;
}

interface DeleteApiKeyResponse {
  ok: true;
}

// BYOK F48: borra el secreto cifrado y marca la metadata como no configurada.
// NO declara secrets:[byokMasterKey] — solo borra docs, no descifra.
export const deleteApiKey = onCall<DeleteApiKeyRequest, Promise<DeleteApiKeyResponse>>(
  {
    timeoutSeconds: 10,
    region: 'us-central1',
  },
  async (request) => {
    const userId = requireVerified(request);
    await assertAllowlisted(request.auth?.token.email);
    const provider = request.data?.provider;

    if (provider !== 'anthropic') {
      throw appError('delete-key-invalid-provider', 'invalid-argument', 'Provider no soportado');
    }

    try {
      // WriteBatch: borrar ciphertext + actualizar metadata atómicos.
      const db = admin.firestore();
      const batch = db.batch();
      batch.delete(db.doc(`userSecrets/${userId}/keys/${provider}`));
      batch.set(
        db.doc(`users/${userId}/settings/aiKeys`),
        { [provider]: { configured: false, last4: null } },
        { merge: true },
      );
      await batch.commit();

      logger.info('deleteApiKey: ok', { userId, provider });
      return { ok: true };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      logger.error('deleteApiKey: failed', { userId, provider, code, message });
      throw appError('delete-key-failed', 'internal', 'No se pudo borrar la API key');
    }
  },
);
