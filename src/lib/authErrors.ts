export type AuthErrorContext = 'signin' | 'signup' | 'reset';

const GENERIC_ACCOUNT_EXISTS =
  'Ya existe una cuenta con este email. Probá iniciar sesión o usar Google.';

const RESET_GENERIC = 'Si la cuenta existe, recibirás un enlace en tu email.';

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
    default:
      return 'Algo salió mal. Intentá de nuevo.';
  }
}
