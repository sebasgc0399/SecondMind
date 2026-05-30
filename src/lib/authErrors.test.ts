import { describe, it, expect } from 'vitest';
import { mapAuthError } from './authErrors';

const GENERIC = 'Ya existe una cuenta con este email. Probá iniciar sesión o usar Google.';

describe('mapAuthError', () => {
  describe('cross-provider conflict (F5)', () => {
    it('email-already-in-use → mensaje generico unificado', () => {
      expect(mapAuthError('auth/email-already-in-use', 'signup')).toBe(GENERIC);
    });

    it('account-exists-with-different-credential → mismo string (EEP impide identificar provider)', () => {
      expect(mapAuthError('auth/account-exists-with-different-credential', 'signin')).toBe(GENERIC);
    });
  });

  describe('popup silenciado', () => {
    it('popup-closed-by-user → empty string (no surface)', () => {
      expect(mapAuthError('auth/popup-closed-by-user', 'signin')).toBe('');
    });

    it('cancelled-popup-request → empty string', () => {
      expect(mapAuthError('auth/cancelled-popup-request', 'signin')).toBe('');
    });
  });

  describe('user-not-found context-aware', () => {
    it('reset context → mensaje generico (anti-enumeration)', () => {
      expect(mapAuthError('auth/user-not-found', 'reset')).toBe(
        'Si la cuenta existe, recibirás un enlace en tu email.',
      );
    });

    it('signin context → colapsa a credenciales incorrectas (anti-enumeration A-5)', () => {
      expect(mapAuthError('auth/user-not-found', 'signin')).toBe('Email o contraseña incorrectos.');
    });
  });

  describe('password policy (Firebase Console hardening)', () => {
    it('weak-password → mensaje alineado con policy (8 chars + numerico)', () => {
      expect(mapAuthError('auth/weak-password', 'signup')).toBe(
        'Mínimo 8 caracteres con al menos un número.',
      );
    });
  });

  describe('errors comunes', () => {
    it('invalid-email', () => {
      expect(mapAuthError('auth/invalid-email')).toBe('Email inválido.');
    });

    it('wrong-password / invalid-credential (EEP activa devuelve invalid-credential)', () => {
      expect(mapAuthError('auth/wrong-password')).toBe('Email o contraseña incorrectos.');
      expect(mapAuthError('auth/invalid-credential')).toBe('Email o contraseña incorrectos.');
    });

    it('too-many-requests', () => {
      expect(mapAuthError('auth/too-many-requests')).toBe(
        'Demasiados intentos. Probá de nuevo en unos minutos.',
      );
    });

    it('network-request-failed', () => {
      expect(mapAuthError('auth/network-request-failed')).toBe(
        'Sin conexión. Verificá tu internet.',
      );
    });
  });

  describe('fallback y default context', () => {
    it('unknown code → fallback generico', () => {
      expect(mapAuthError('auth/unknown-thing')).toBe('Algo salió mal. Intentá de nuevo.');
    });

    it('undefined code → fallback generico', () => {
      expect(mapAuthError(undefined)).toBe('Algo salió mal. Intentá de nuevo.');
    });

    it('default context es signin (user-not-found colapsado)', () => {
      expect(mapAuthError('auth/user-not-found')).toBe('Email o contraseña incorrectos.');
    });
  });
});
