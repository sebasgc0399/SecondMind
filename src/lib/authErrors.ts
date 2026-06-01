export type AuthErrorContext = 'signin' | 'signup' | 'reset';

const GENERIC_ACCOUNT_EXISTS =
  'Ya existe una cuenta con este email. Probá iniciar sesión o usar Google.';

const RESET_GENERIC = 'Si la cuenta existe, recibirás un enlace en tu email.';

// SPEC-51 F4 (A-3): copy genérico de "sin acceso a la beta". NO confirma membresía
// (no menciona lista/allowlist/invitado) y por ahora NO incluye canal de contacto.
// EDITAR ACÁ cuando exista el formulario público de solicitud de acceso para
// apuntar a él — punto único de edición.
export const BETA_NO_ACCESS_MESSAGE = 'Tu cuenta todavía no tiene acceso a la beta.';

export function mapAuthError(
  code: string | undefined,
  context: AuthErrorContext = 'signin',
): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Email inválido.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email o contraseña incorrectos.';
    case 'auth/user-not-found':
      // A-5 (F3): en signin colapsa al mismo string que wrong-password/
      // invalid-credential → sin oráculo de enumeración de cuentas. reset
      // mantiene su genérico anti-enumeration.
      return context === 'reset' ? RESET_GENERIC : 'Email o contraseña incorrectos.';
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada.';
    case 'auth/email-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return GENERIC_ACCOUNT_EXISTS;
    case 'auth/weak-password':
      return 'Mínimo 8 caracteres con al menos un número.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Probá de nuevo en unos minutos.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Verificá tu internet.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'capacity-full':
      return 'Beta llena. No podemos crear cuentas nuevas ahora.';
    case 'capacity-unavailable':
      return 'No se pudo verificar disponibilidad. Reintentá.';
    case 'allowlist-not-authorized':
      // SPEC-51 F3/F4 (A-3): gate post-auth — el usuario autenticado no está en la
      // allowlist. Copy genérico que NO confirma membresía (ver BETA_NO_ACCESS_MESSAGE).
      return BETA_NO_ACCESS_MESSAGE;
    case 'access-check-unavailable':
      // SPEC-51 F3 (A-3): no se pudo verificar el acceso (red / callable caída). NO
      // echamos al usuario; invitamos a reintentar. Distinto de allowlist-not-authorized.
      return 'No pudimos verificar tu acceso. Reintentá en un momento.';
    default:
      return 'Algo salió mal. Intentá de nuevo.';
  }
}
