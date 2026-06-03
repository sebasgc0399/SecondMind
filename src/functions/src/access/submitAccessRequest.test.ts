import { describe, it, expect } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { normalizeEmail, isValidEmail, validateInput } from './submitAccessRequest';

// SPEC-52 F2 — lógica PURA de validación/normalización (sin Firestore). El dedup en
// transacción y el rate-limit por IP son I/O → se verifican E2E, no unit (igual que
// enforceRateLimit). El invariante no-oráculo (respuesta uniforme, cero lectura de
// allowlist/) también es E2E.

describe('submitAccessRequest — validación pura (SPEC-52 F2)', () => {
  it('normaliza email (trim + lowercase)', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });

  it('acepta emails válidos', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('foo.bar+x@sub.domain.io')).toBe(true);
  });

  it('rechaza emails inválidos', () => {
    expect(isValidEmail('no-arroba')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
    expect(isValidEmail('a@@b.com')).toBe(false);
  });

  it('rechaza email demasiado largo (> 254)', () => {
    expect(isValidEmail('a'.repeat(250) + '@b.com')).toBe(false);
  });

  it('validateInput devuelve email normalizado sin motivo', () => {
    expect(validateInput({ email: ' User@Test.com ' })).toEqual({ email: 'user@test.com' });
  });

  it('validateInput incluye motivo trimmeado cuando viene', () => {
    expect(validateInput({ email: 'a@b.com', motivo: '  quiero entrar  ' })).toEqual({
      email: 'a@b.com',
      motivo: 'quiero entrar',
    });
  });

  it('validateInput omite motivo vacío/whitespace', () => {
    expect(validateInput({ email: 'a@b.com', motivo: '   ' })).toEqual({ email: 'a@b.com' });
  });

  it('validateInput lanza si falta el email', () => {
    expect(() => validateInput({})).toThrow(HttpsError);
    expect(() => validateInput({ email: '   ' })).toThrow(HttpsError);
  });

  it('validateInput lanza si el email es inválido', () => {
    expect(() => validateInput({ email: 'no-valido' })).toThrow(HttpsError);
  });

  it('validateInput lanza si el motivo excede el límite', () => {
    expect(() => validateInput({ email: 'a@b.com', motivo: 'x'.repeat(281) })).toThrow(HttpsError);
  });

  it('validateInput lanza si el motivo no es string', () => {
    expect(() => validateInput({ email: 'a@b.com', motivo: 123 })).toThrow(HttpsError);
  });
});
