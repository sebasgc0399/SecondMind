import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { encryptSecret } from '../lib/crypto';
import { requireVerified } from '../lib/requireVerified';
import { validateProviderKey } from '../lib/validateProviderKey';
import { sanitizeError } from '../lib/sanitizeError';

const byokMasterKey = defineSecret('BYOK_MASTER_KEY');

interface SaveApiKeyRequest {
  provider: string;
  key: string;
}

interface SaveApiKeyResponse {
  ok: true;
  last4: string;
}

// BYOK F48: el cliente envía la key en claro UNA vez por TLS. La validamos
// contra el provider, la ciframos con la master key y la guardamos en
// userSecrets/ (deny-all). La key nunca vuelve al cliente; solo metadata.
export const saveApiKey = onCall<SaveApiKeyRequest, Promise<SaveApiKeyResponse>>(
  {
    secrets: [byokMasterKey],
    timeoutSeconds: 10,
    region: 'us-central1',
    // A-4 (F2): cap de instancias. saveApiKey hace un fetch a Anthropic por
    // invocación (validateProviderKey) → bounded-cost ante abuso.
    maxInstances: 3,
  },
  async (request) => {
    const userId = requireVerified(request);
    const provider = request.data?.provider;
    const rawKey = request.data?.key;

    if (provider !== 'anthropic') {
      throw new HttpsError('invalid-argument', 'Provider no soportado');
    }
    if (typeof rawKey !== 'string' || !rawKey.trim()) {
      throw new HttpsError('invalid-argument', 'La API key es requerida');
    }
    const key = rawKey.trim();

    try {
      const validation = await validateProviderKey(provider, key);
      if (validation === 'invalid') {
        throw new HttpsError('invalid-argument', 'La API key es inválida');
      }
      if (validation === 'unknown') {
        throw new HttpsError(
          'unavailable',
          'No pudimos validar la key ahora. Probá de nuevo en un momento.',
        );
      }

      const encrypted = encryptSecret(key, byokMasterKey.value(), userId);
      const last4 = key.slice(-4);

      // WriteBatch: ciphertext + metadata atómicos (evita estado parcial).
      const db = admin.firestore();
      const batch = db.batch();
      batch.set(db.doc(`userSecrets/${userId}/keys/${provider}`), {
        ...encrypted,
        algo: 'aes-256-gcm',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(
        db.doc(`users/${userId}/settings/aiKeys`),
        { [provider]: { configured: true, last4 } },
        { merge: true },
      );
      await batch.commit();

      logger.info('saveApiKey: ok', { userId, provider, last4 });
      return { ok: true, last4 };
    } catch (error) {
      // Re-lanzar los HttpsError ya mapeados (invalid-argument/unavailable)
      // sin pasarlos por sanitizeError (los degradaría a 'internal').
      if (error instanceof HttpsError) throw error;
      const { code, message } = sanitizeError(error);
      logger.error('saveApiKey: failed', { userId, provider, code, message });
      throw new HttpsError('internal', 'No se pudo guardar la API key');
    }
  },
);
