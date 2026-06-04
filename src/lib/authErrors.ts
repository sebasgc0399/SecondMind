export type AuthErrorContext = 'signin' | 'signup' | 'reset';

const GENERIC_ACCOUNT_EXISTS =
  'Ya existe una cuenta con este email. Probá iniciar sesión o usar Google.';

const RESET_GENERIC = 'Si la cuenta existe, recibirás un enlace en tu email.';

// SPEC-51 F4 (A-3) / SPEC-52 F7: copy genérico de "sin acceso a la beta". NO confirma
// membresía (no menciona lista/allowlist/invitado, sin email). Desde SPEC-52 existe el
// formulario público (/solicitar-acceso); el CTA vive en el footer persistente de
// LoginCard y este copy apunta hacia abajo. Punto único de edición del texto.
export const BETA_NO_ACCESS_MESSAGE =
  'Tu cuenta todavía no tiene acceso a la beta. Podés solicitarlo más abajo.';

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

// SPEC-54: copy de la landing custom /auth/action (procesar el oobCode de un link de
// email con applyActionCode / verifyPasswordResetCode / confirmPasswordReset). Separado
// de mapAuthError porque los códigos relevantes son los de "action-code", no los de
// signin/signup/reset-send. El default cubre los errores de ENLACE (el caso dominante
// acá), no un "algo salió mal" genérico.
export function mapActionError(code: string | undefined): string {
  switch (code) {
    case 'auth/expired-action-code':
      return 'El enlace expiró. Pedí uno nuevo.';
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada.';
    case 'auth/weak-password':
      // Alineado a la regla del cliente (≥8) que ya validamos antes de llamar a
      // confirmPasswordReset; NO al copy "con al menos un número" (no se enforce).
      return 'Mínimo 8 caracteres.';
    case 'auth/network-request-failed':
      // El enlace está bien; falló la red. NO mandar a "pedí uno nuevo" (resolvería el
      // problema equivocado): invitar a reintentar el mismo link.
      return 'Hubo un problema de conexión. Reintentá.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Probá de nuevo en unos minutos.';
    // auth/invalid-action-code + auth/user-not-found caen al default a propósito:
    // "inválido o ya usado" es honesto (Firebase no los distingue) y user-not-found
    // colapsa al genérico para no confirmar enumeración de cuentas (paranoia F50-53).
    default:
      return 'El enlace no es válido. Pedí uno nuevo.';
  }
}
