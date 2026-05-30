import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret, type EncryptedSecret } from './crypto';

const masterKey = randomBytes(32).toString('base64');
const aad = 'uid-abc-123'; // AAD = uid del dueño (F7 K-2)

// Flip del primer byte de un buffer base64 — simula tampering.
function flipFirstByte(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  buf[0] ^= 0xff;
  return buf.toString('base64');
}

describe('crypto BYOK (AES-256-GCM)', () => {
  it('round-trips el plaintext con AAD correcto', () => {
    const plaintext = 'sk-ant-api03-ejemplo-de-key-secreta-1234567890';
    const enc = encryptSecret(plaintext, masterKey, aad);
    expect(decryptSecret(enc, masterKey, aad)).toBe(plaintext);
  });

  it('produce un IV (y ciphertext) distinto para el mismo input', () => {
    const a = encryptSecret('mismo-valor', masterKey, aad);
    const b = encryptSecret('mismo-valor', masterKey, aad);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('persiste keyVersion: 1 en el payload', () => {
    const enc = encryptSecret('secreto', masterKey, aad);
    expect(enc.keyVersion).toBe(1);
  });

  it('lanza si el ciphertext fue manipulado', () => {
    const enc = encryptSecret('secreto', masterKey, aad);
    expect(() =>
      decryptSecret({ ...enc, ciphertext: flipFirstByte(enc.ciphertext) }, masterKey, aad),
    ).toThrow();
  });

  it('lanza si el authTag fue manipulado', () => {
    const enc = encryptSecret('secreto', masterKey, aad);
    expect(() =>
      decryptSecret({ ...enc, authTag: flipFirstByte(enc.authTag) }, masterKey, aad),
    ).toThrow();
  });

  it('lanza al descifrar con una master key distinta', () => {
    const enc = encryptSecret('secreto', masterKey, aad);
    const otraKey = randomBytes(32).toString('base64');
    expect(() => decryptSecret(enc, otraKey, aad)).toThrow();
  });

  it('lanza si la master key no es de 32 bytes', () => {
    const keyCorta = randomBytes(16).toString('base64');
    expect(() => encryptSecret('x', keyCorta, aad)).toThrow();
  });

  // F7 K-2: el AAD ata el ciphertext al uid → no es portable entre usuarios.
  it('lanza al descifrar con un AAD (uid) distinto al usado al cifrar', () => {
    const enc = encryptSecret('secreto', masterKey, 'uid-A');
    expect(() => decryptSecret(enc, masterKey, 'uid-B')).toThrow();
  });

  // F7 K-3: sin fallback v0 — keyVersion ausente o desconocida lanza.
  it('lanza si keyVersion es desconocida', () => {
    const enc = encryptSecret('secreto', masterKey, aad);
    expect(() => decryptSecret({ ...enc, keyVersion: 99 }, masterKey, aad)).toThrow();
  });

  it('lanza si keyVersion está ausente (doc pre-F7)', () => {
    const enc = encryptSecret('secreto', masterKey, aad);
    const sinVersion = { ciphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag };
    expect(() => decryptSecret(sinVersion as unknown as EncryptedSecret, masterKey, aad)).toThrow();
  });
});
