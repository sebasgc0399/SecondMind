import type { TFunction } from 'i18next';

export type AuthErrorContext = 'signin' | 'signup' | 'reset';

// SPEC-58 F3.2 — mapea errores de AUTENTICACIÓN a copy localizado del catálogo errors.*.
// Maneja los códigos auth/* del SDK Firebase (NO pasan por appError: vienen del cliente,
// no de las CFs) + los 2 sintéticos de useAuth (allowlist-not-authorized /
// access-check-unavailable, objetos {code} sin err.details). Recibe t por parámetro
// (patrón del repo). Separado de mapCfError (errores de CFs callables) a propósito: los
// consumidores de auth llaman UN solo mapper y necesitan el `context`.
//
// Invariantes de seguridad que sobreviven a la migración a t():
//  (1) anti-enumeración — user-not-found colapsa a "credenciales" en signin (mismo string
//      que wrong-password) y a un genérico en reset; ningún copy menciona lista/allowlist.
//  (2) popup-closed/cancelled → '' (señal de supresión, NO pasa por t() — no es copy).
//  (3) account-exists unificado (EEP impide identificar el provider).
export function mapAuthError(
  code: string | undefined,
  context: AuthErrorContext,
  t: TFunction,
): string {
  switch (code) {
    case 'auth/invalid-email':
      return t('errors.invalidEmail', 'Email inválido.');
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return t('errors.invalidCredentials', 'Email o contraseña incorrectos.');
    case 'auth/user-not-found':
      // A-5 (F3): en signin colapsa al mismo string que wrong-password/invalid-credential
      // → sin oráculo de enumeración. reset mantiene su genérico anti-enumeration.
      return context === 'reset'
        ? t('errors.resetGeneric', 'Si la cuenta existe, recibirás un enlace en tu email.')
        : t('errors.invalidCredentials', 'Email o contraseña incorrectos.');
    case 'auth/user-disabled':
      return t('errors.accountDisabled', 'Esta cuenta está deshabilitada.');
    case 'auth/email-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return t(
        'errors.accountExists',
        'Ya existe una cuenta con este email. Probá iniciar sesión o usar Google.',
      );
    case 'auth/weak-password':
      return t('errors.weakPassword', 'Mínimo 8 caracteres con al menos un número.');
    case 'auth/too-many-requests':
      return t('errors.tooManyRequests', 'Demasiados intentos. Probá de nuevo en unos minutos.');
    case 'auth/network-request-failed':
      return t('errors.networkError', 'Sin conexión. Verificá tu internet.');
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      // Señal de supresión: el usuario cerró el popup, no hay error que mostrar. Cadena
      // vacía intencional — NO pasa por t() (no es copy localizable).
      return '';
    case 'allowlist-not-authorized':
      // SPEC-51 F3/F4 (A-3): gate post-auth — usuario autenticado fuera de la allowlist.
      // Copy genérico que NO confirma membresía. Comparte la key con el guard CF
      // beta-unauthorized (mismo mensaje al usuario).
      return t(
        'errors.betaUnauthorized',
        'Tu cuenta todavía no tiene acceso a la beta. Podés solicitarlo más abajo.',
      );
    case 'access-check-unavailable':
      // SPEC-51 F3 (A-3): no se pudo verificar el acceso (red / callable caída). Invitamos
      // a reintentar. Distinto de allowlist-not-authorized.
      return t(
        'errors.accessCheckUnavailable',
        'No pudimos verificar tu acceso. Reintentá en un momento.',
      );
    default:
      return t('errors.default', 'Algo salió mal. Intentá de nuevo.');
  }
}

// SPEC-54: copy de la landing /auth/action (oobCode de links de email). Los códigos son
// de "action-code", distintos de signin/signup/reset-send. Copys DISTINTOS de mapAuthError
// preservados a propósito: weak-password sin "un número" (el cliente no lo enforce acá),
// network-request-failed invita a reintentar el MISMO link (no "pedí uno nuevo"), y el
// default cubre el caso dominante "enlace inválido o ya usado".
export function mapActionError(code: string | undefined, t: TFunction): string {
  switch (code) {
    case 'auth/expired-action-code':
      return t('errors.actionExpired', 'El enlace expiró. Pedí uno nuevo.');
    case 'auth/user-disabled':
      return t('errors.accountDisabled', 'Esta cuenta está deshabilitada.');
    case 'auth/weak-password':
      return t('errors.weakPasswordShort', 'Mínimo 8 caracteres.');
    case 'auth/network-request-failed':
      return t('errors.actionNetworkError', 'Hubo un problema de conexión. Reintentá.');
    case 'auth/too-many-requests':
      return t('errors.tooManyRequests', 'Demasiados intentos. Probá de nuevo en unos minutos.');
    default:
      return t('errors.actionInvalid', 'El enlace no es válido. Pedí uno nuevo.');
  }
}
