import { applyActionCode, verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// SPEC-54: wrappers delgados de las APIs action-code de Firebase Auth para la landing
// custom /auth/action. Encapsulan el `import { auth }` en un punto único (consistente con
// cómo el resto de la app aísla Firebase en hooks/lib) y dan un lugar testeable/mockeable.
// Sin lógica de errores ni de estado — eso vive en los componentes + mapActionError.

// verifyEmail: aplica (y CONSUME, single-use) el oobCode. Marca emailVerified=true.
export function applyVerifyEmailCode(oobCode: string): Promise<void> {
  return applyActionCode(auth, oobCode);
}

// resetPassword paso 1: valida el oobCode (idempotente, NO lo consume) y devuelve el email
// asociado para mostrarlo antes de pedir la nueva contraseña.
export function verifyResetCode(oobCode: string): Promise<string> {
  return verifyPasswordResetCode(auth, oobCode);
}

// resetPassword paso 2: setea la nueva contraseña (CONSUME el oobCode). Corre on-submit.
export function confirmReset(oobCode: string, newPassword: string): Promise<void> {
  return confirmPasswordReset(auth, oobCode, newPassword);
}
