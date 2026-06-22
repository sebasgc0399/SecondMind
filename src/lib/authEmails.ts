import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

// SPEC-65 F2.4 — wrappers de los callables que emiten los emails de Auth vía Resend (reemplazan
// sendEmailVerification / sendPasswordResetEmail del SDK de Firebase). Espejo de allowlist.ts.
// PROPAGAN cualquier error de la callable:
//  - verify lo necesita (el reenvío conserva la señal "no se pudo, reintentá": la CF throwea
//    verify-send-failed si el envío falla);
//  - reset solo puede burbujear reset-invalid-email / rate-limited — el resto la CF lo colapsa a
//    éxito uniforme por anti-enumeración.
const sendVerificationEmailFn = httpsCallable<unknown, { ok: true }>(
  functions,
  'sendVerificationEmail',
);
const sendResetEmailFn = httpsCallable<{ email: string }, { ok: true }>(
  functions,
  'sendResetEmail',
);

export async function sendVerificationEmail(): Promise<void> {
  await sendVerificationEmailFn();
}

export async function sendResetEmail(email: string): Promise<void> {
  await sendResetEmailFn({ email });
}
