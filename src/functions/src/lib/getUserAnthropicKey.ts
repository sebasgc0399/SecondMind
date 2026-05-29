import * as admin from 'firebase-admin';
import { decryptSecret, type EncryptedSecret } from './crypto';

// BYOK F48: lee la API key cifrada del usuario desde userSecrets/ (deny-all,
// solo Admin SDK) y la descifra con la master key. Retorna null si el usuario
// no configuró key → las CFs de generación hacen early-return (feature off).
export async function getUserAnthropicKey(
  userId: string,
  masterKeyB64: string,
): Promise<string | null> {
  const snap = await admin.firestore().doc(`userSecrets/${userId}/keys/anthropic`).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<EncryptedSecret> | undefined;
  if (!data?.ciphertext || !data.iv || !data.authTag) return null;
  return decryptSecret(
    { ciphertext: data.ciphertext, iv: data.iv, authTag: data.authTag },
    masterKeyB64,
  );
}

// D9 (G2): tras un 401/403 de Anthropic en uso (key revocada o expirada),
// invalida la key: borra el ciphertext y marca la metadata configured:false.
// Corta el reintento perpetuo (autoTagNote es onDocumentWritten → se dispara
// en cada edición) y refleja el estado en la UI (settings/aiKeys).
export async function invalidateUserAnthropicKey(userId: string): Promise<void> {
  const db = admin.firestore();
  const batch = db.batch();
  batch.delete(db.doc(`userSecrets/${userId}/keys/anthropic`));
  batch.set(
    db.doc(`users/${userId}/settings/aiKeys`),
    { anthropic: { configured: false, last4: null } },
    { merge: true },
  );
  await batch.commit();
}
