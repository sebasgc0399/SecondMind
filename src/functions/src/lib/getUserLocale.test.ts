import { describe, expect, it } from 'vitest';
import { parseLocale } from './getUserLocale';

// F3.1 (SPEC-58) — unit de la lógica PURA de normalización del locale. El I/O de
// getUserLocale (admin.firestore().doc().get()) se verifica E2E/emulador (no hay
// mock de admin; misma convención que rateLimit.test.ts).
describe('parseLocale (F3.1) — normaliza el campo locale de preferences', () => {
  it("'en' → 'en'", () => {
    expect(parseLocale('en')).toBe('en');
  });

  it("'es' → 'es'", () => {
    expect(parseLocale('es')).toBe('es');
  });

  it("null (nunca elegido) → 'es'", () => {
    expect(parseLocale(null)).toBe('es');
  });

  it('undefined (campo locale ausente, usuarios pre-F1.3) → es', () => {
    expect(parseLocale(undefined)).toBe('es');
  });

  it("locale inválido ('fr') → 'es'", () => {
    expect(parseLocale('fr')).toBe('es');
  });

  it('tipos no-string → es', () => {
    expect(parseLocale(123)).toBe('es');
    expect(parseLocale({})).toBe('es');
    expect(parseLocale([])).toBe('es');
    expect(parseLocale('')).toBe('es');
  });
});
