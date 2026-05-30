import { describe, it, expect } from 'vitest';
import { normalizeEmail } from './normalizeEmail';

describe('normalizeEmail', () => {
  it('recorta espacios al inicio y al final', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('pasa a lowercase', () => {
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('combina trim + lowercase', () => {
    expect(normalizeEmail('  Beta.Tester@Gmail.Com ')).toBe('beta.tester@gmail.com');
  });

  it('es idempotente', () => {
    const once = normalizeEmail('  User@Example.COM ');
    expect(normalizeEmail(once)).toBe(once);
  });
});
