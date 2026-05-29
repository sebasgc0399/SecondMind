import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// AES-256-GCM para cifrar API keys del usuario (BYOK, F48). La master key
// (BYOK_MASTER_KEY) vive en Secret Manager; este módulo solo la consume.
// Sin imports de firebase-functions a propósito: así corre bajo `npm test`
// (vitest, env node) sin arrastrar el runtime de Cloud Functions.
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // tamaño recomendado para GCM
const KEY_BYTES = 32; // AES-256

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

function decodeMasterKey(masterKeyB64: string): Buffer {
  const key = Buffer.from(masterKeyB64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`BYOK master key debe ser de ${KEY_BYTES} bytes (recibidos ${key.length})`);
  }
  return key;
}

export function encryptSecret(plaintext: string, masterKeyB64: string): EncryptedSecret {
  const key = decodeMasterKey(masterKeyB64);
  const iv = randomBytes(IV_BYTES); // IV único por escritura — nunca reusar con la misma key en GCM
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptSecret(payload: EncryptedSecret, masterKeyB64: string): string {
  const key = decodeMasterKey(masterKeyB64);
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  // ALGO hardcodeado, NO se lee del payload: evita downgrade si el doc fuera manipulado.
  const decipher = createDecipheriv(ALGO, key, iv);
  // setAuthTag DEBE ir antes de update/final, sino GCM no verifica integridad.
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
