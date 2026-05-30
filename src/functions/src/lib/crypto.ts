import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// AES-256-GCM para cifrar API keys del usuario (BYOK, F48). La master key
// (BYOK_MASTER_KEY) vive en Secret Manager; este módulo solo la consume.
// Sin imports de firebase-functions a propósito: así corre bajo `npm test`
// (vitest, env node) sin arrastrar el runtime de Cloud Functions.
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // tamaño recomendado para GCM
const KEY_BYTES = 32; // AES-256

// SPEC-50 F7 (K-3): discriminador de esquema. Permite rotación/KMS futura sin
// adivinar el formato del doc. decryptSecret lo EXIGE (sin fallback v0): los
// docs pre-F7 (sin keyVersion/AAD) se wipean pre-release, no se descifran.
const KEY_VERSION = 1;

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  keyVersion: number;
}

function decodeMasterKey(masterKeyB64: string): Buffer {
  const key = Buffer.from(masterKeyB64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`BYOK master key debe ser de ${KEY_BYTES} bytes (recibidos ${key.length})`);
  }
  return key;
}

// SPEC-50 F7 (K-2): `aad` ata el ciphertext a un contexto (el uid del dueño).
// Un ciphertext deja de ser portable entre usuarios bajo la misma master key:
// descifrar con un AAD distinto al usado al cifrar falla la verificación GCM.
export function encryptSecret(
  plaintext: string,
  masterKeyB64: string,
  aad: string,
): EncryptedSecret {
  const key = decodeMasterKey(masterKeyB64);
  const iv = randomBytes(IV_BYTES); // IV único por escritura — nunca reusar con la misma key en GCM
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(Buffer.from(aad)); // DEBE ir antes de update/final
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: KEY_VERSION,
  };
}

export function decryptSecret(payload: EncryptedSecret, masterKeyB64: string, aad: string): string {
  // Exigir keyVersion conocida ANTES de tocar la cripto: sin fallback v0 (D5).
  if (payload.keyVersion !== KEY_VERSION) {
    throw new Error(`keyVersion no soportada: ${String(payload.keyVersion)}`);
  }
  const key = decodeMasterKey(masterKeyB64);
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  // ALGO hardcodeado, NO se lee del payload: evita downgrade si el doc fuera manipulado.
  const decipher = createDecipheriv(ALGO, key, iv);
  // setAuthTag antes de final, setAAD antes de update: sino GCM no verifica integridad.
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(aad)); // mismo AAD que al cifrar, sino falla la verificación
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
