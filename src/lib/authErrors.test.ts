import { describe, it, expect } from 'vitest';
import { mapAuthError, mapActionError } from './authErrors';
import type { TFunction } from 'i18next';

// tMock: devuelve el defaultValue inline (el copy es REAL), nunca la key. Así el test
// verifica que cada código mapea al COPY correcto — un tMock que devolviera la key pasaría
// en verde aunque el copy estuviera roto (trampa tEs de F1). Los typos de key los caza tsc
// (resources.d.ts tipa errors.*), complementario a este test.
const t = ((_key: string, defaultValue?: string) => defaultValue ?? _key) as unknown as TFunction;

const GENERIC = 'Ya existe una cuenta con este email. Probá iniciar sesión o usar Google.';
const BETA_NO_ACCESS = 'Tu cuenta todavía no tiene acceso a la beta. Podés solicitarlo más abajo.';

describe('mapAuthError', () => {
  describe('cross-provider conflict (F5)', () => {
    it('email-already-in-use → mensaje generico unificado', () => {
      expect(mapAuthError('auth/email-already-in-use', 'signup', t)).toBe(GENERIC);
    });

    it('account-exists-with-different-credential → mismo string (EEP impide identificar provider)', () => {
      expect(mapAuthError('auth/account-exists-with-different-credential', 'signin', t)).toBe(
        GENERIC,
      );
    });
  });

  // INVARIANTE 2: popup silenciado → '' SIN pasar por t() (señal de supresión, no copy).
  describe('popup silenciado', () => {
    it('popup-closed-by-user → empty string (no surface)', () => {
      expect(mapAuthError('auth/popup-closed-by-user', 'signin', t)).toBe('');
    });

    it('cancelled-popup-request → empty string', () => {
      expect(mapAuthError('auth/cancelled-popup-request', 'signin', t)).toBe('');
    });
  });

  // INVARIANTE 1: anti-enumeración — user-not-found context-aware.
  describe('user-not-found context-aware (anti-enumeration A-5)', () => {
    it('reset context → mensaje generico', () => {
      expect(mapAuthError('auth/user-not-found', 'reset', t)).toBe(
        'Si la cuenta existe, recibirás un enlace en tu email.',
      );
    });

    it('signin context → colapsa a credenciales incorrectas', () => {
      expect(mapAuthError('auth/user-not-found', 'signin', t)).toBe(
        'Email o contraseña incorrectos.',
      );
    });
  });

  describe('password policy', () => {
    it('weak-password → copy alineado con policy (8 chars + numerico)', () => {
      expect(mapAuthError('auth/weak-password', 'signup', t)).toBe(
        'Mínimo 8 caracteres con al menos un número.',
      );
    });
  });

  describe('errores comunes', () => {
    it('invalid-email', () => {
      expect(mapAuthError('auth/invalid-email', 'signin', t)).toBe('Email inválido.');
    });

    it('wrong-password / invalid-credential', () => {
      expect(mapAuthError('auth/wrong-password', 'signin', t)).toBe(
        'Email o contraseña incorrectos.',
      );
      expect(mapAuthError('auth/invalid-credential', 'signin', t)).toBe(
        'Email o contraseña incorrectos.',
      );
    });

    it('too-many-requests', () => {
      expect(mapAuthError('auth/too-many-requests', 'signin', t)).toBe(
        'Demasiados intentos. Probá de nuevo en unos minutos.',
      );
    });

    it('network-request-failed', () => {
      expect(mapAuthError('auth/network-request-failed', 'signin', t)).toBe(
        'Sin conexión. Verificá tu internet.',
      );
    });
  });

  // INVARIANTE 1 (cont.): los 2 sintéticos no confirman membresía (sin lista/allowlist/@).
  describe('allowlist post-auth (SPEC-51 F3/F4) — sin oraculo de membresia', () => {
    it('allowlist-not-authorized usa copy generico que NO confirma membresia', () => {
      const result = mapAuthError('allowlist-not-authorized', 'signin', t);
      expect(result).toBe(BETA_NO_ACCESS);
      expect(result).not.toMatch(/lista|allowlist|invitad/i);
      expect(result).not.toContain('@');
    });

    it('access-check-unavailable invita a reintentar, distinto de no-autorizado', () => {
      const result = mapAuthError('access-check-unavailable', 'signin', t);
      expect(result).not.toBe(BETA_NO_ACCESS);
      expect(result.toLowerCase()).toContain('reintent');
      expect(result).not.toMatch(/lista|allowlist|invitad/i);
    });
  });

  describe('fallback', () => {
    it('unknown code → fallback generico', () => {
      expect(mapAuthError('auth/unknown-thing', 'signin', t)).toBe(
        'Algo salió mal. Intentá de nuevo.',
      );
    });

    it('undefined code → fallback generico', () => {
      expect(mapAuthError(undefined, 'signin', t)).toBe('Algo salió mal. Intentá de nuevo.');
    });
  });
});

describe('mapActionError', () => {
  it('expired-action-code → pedir uno nuevo', () => {
    expect(mapActionError('auth/expired-action-code', t)).toBe('El enlace expiró. Pedí uno nuevo.');
  });

  // INVARIANTE 3: copys de action DISTINTOS de mapAuthError, no fusionados.
  it('weak-password → copy CORTO (sin "un numero"), distinto de mapAuthError', () => {
    expect(mapActionError('auth/weak-password', t)).toBe('Mínimo 8 caracteres.');
    expect(mapActionError('auth/weak-password', t)).not.toBe(
      mapAuthError('auth/weak-password', 'signup', t),
    );
  });

  it('network-request-failed → copy de action (reintentar el link), distinto de mapAuthError', () => {
    expect(mapActionError('auth/network-request-failed', t)).toBe(
      'Hubo un problema de conexión. Reintentá.',
    );
    expect(mapActionError('auth/network-request-failed', t)).not.toBe(
      mapAuthError('auth/network-request-failed', 'signin', t),
    );
  });

  it('too-many-requests → compartido con mapAuthError', () => {
    expect(mapActionError('auth/too-many-requests', t)).toBe(
      'Demasiados intentos. Probá de nuevo en unos minutos.',
    );
  });

  it('default → enlace invalido (caso dominante: invalido o ya usado)', () => {
    expect(mapActionError('auth/invalid-action-code', t)).toBe(
      'El enlace no es válido. Pedí uno nuevo.',
    );
    expect(mapActionError(undefined, t)).toBe('El enlace no es válido. Pedí uno nuevo.');
  });
});
