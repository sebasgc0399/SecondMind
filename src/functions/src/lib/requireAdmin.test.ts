import { describe, it, expect } from 'vitest';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { requireAdmin } from './requireAdmin';

// SPEC-52/53 — gate admin-only de los callables (list/process/revoke). Lógica PURA (lee el
// token, sin I/O) → unit. Cubre los polos: sin sesión, sesión no-admin, admin (case-insensitive),
// secret vacío (fail-closed) y token sin email.
const ADMIN = 'admin@secondmind.app';

function req(auth: { token: { email?: unknown } } | null): CallableRequest {
  return { auth } as unknown as CallableRequest;
}

function codeOf(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    return e instanceof HttpsError ? e.code : 'no-httpserror';
  }
  return 'no-throw';
}

describe('requireAdmin (SPEC-52/53)', () => {
  it('sin sesión → unauthenticated', () => {
    expect(codeOf(() => requireAdmin(req(null), ADMIN))).toBe('unauthenticated');
  });

  it('sesión no-admin → permission-denied', () => {
    expect(codeOf(() => requireAdmin(req({ token: { email: 'otro@user.com' } }), ADMIN))).toBe(
      'permission-denied',
    );
  });

  it('admin (case-insensitive, con espacios) → no lanza', () => {
    expect(() =>
      requireAdmin(req({ token: { email: '  Admin@SecondMind.app ' } }), ADMIN),
    ).not.toThrow();
  });

  it('secret vacío → permission-denied (fail-closed)', () => {
    expect(codeOf(() => requireAdmin(req({ token: { email: ADMIN } }), ''))).toBe(
      'permission-denied',
    );
  });

  it('token sin email → permission-denied', () => {
    expect(codeOf(() => requireAdmin(req({ token: {} }), ADMIN))).toBe('permission-denied');
  });
});
