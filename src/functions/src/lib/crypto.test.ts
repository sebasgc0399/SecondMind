import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret } from './crypto';

const masterKey = randomBytes(32).toString('base64');

// Flip del primer byte de un buffer base64 — simula tampering.
function flipFirstByte(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  buf[0] ^= 0xff;
  return buf.toString('base64');
}

describe('crypto BYOK (AES-256-GCM)', () => {
  it('round-trips el plaintext', () => {
    const plaintext = 'sk-ant-api03-ejemplo-de-key-secreta-1234567890';
    const enc = encryptSecret(plaintext, masterKey);
    expect(decryptSecret(enc, masterKey)).toBe(plaintext);
  });

  it('produce un IV (y ciphertext) distinto para el mismo input', () => {
    const a = encryptSecret('mismo-valor', masterKey);
    const b = encryptSecret('mismo-valor', masterKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('lanza si el ciphertext fue manipulado', () => {
    const enc = encryptSecret('secreto', masterKey);
    expect(() =>
      decryptSecret({ ...enc, ciphertext: flipFirstByte(enc.ciphertext) }, masterKey),
    ).toThrow();
  });

  it('lanza si el authTag fue manipulado', () => {
    const enc = encryptSecret('secreto', masterKey);
    expect(() =>
      decryptSecret({ ...enc, authTag: flipFirstByte(enc.authTag) }, masterKey),
    ).toThrow();
  });

  it('lanza al descifrar con una master key distinta', () => {
    const enc = encryptSecret('secreto', masterKey);
    const otraKey = randomBytes(32).toString('base64');
    expect(() => decryptSecret(enc, otraKey)).toThrow();
  });

  it('lanza si la master key no es de 32 bytes', () => {
    const keyCorta = randomBytes(16).toString('base64');
    expect(() => encryptSecret('x', keyCorta)).toThrow();
  });
});
