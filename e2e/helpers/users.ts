import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth';
import { getAuthClient, EMU } from './emulator';

// SPEC-55 F5 — usuarios de prueba contra el Auth emulator. El token resultante lleva
// `email` → ejerce el gate REAL (requireAdmin compara token.email; isAllowlisted lee
// token.email). `emailVerified` NO se setea: ninguna de las 5 callables lee
// `token.email_verified` (el gate de verified vive en las security rules, que el Admin SDK
// del runtime de functions bypassa). Emails fijos (admin estable) + resetAuth en beforeEach.

// DEBE coincidir con el ADMIN_EMAIL que inyecta scripts/emu-secret.mjs en .secret.local.
export const ADMIN_EMAIL = 'admin-e2e@secondmind.test';
export const MEMBER_EMAIL = 'member-e2e@secondmind.test';
export const OUTSIDER_EMAIL = 'outsider-e2e@secondmind.test';
const PASSWORD = 'test-password-123';

// Crea (si no existe) + loguea. Tras resetAuth() en beforeEach el usuario no existe, así que
// createUser corre limpio; el catch cubre el re-uso dentro de un mismo test.
async function ensureSignedIn(email: string): Promise<void> {
  const auth = getAuthClient();
  try {
    await createUserWithEmailAndPassword(auth, email, PASSWORD);
  } catch {
    await signInWithEmailAndPassword(auth, email, PASSWORD);
  }
}

export const signInAsAdmin = (): Promise<void> => ensureSignedIn(ADMIN_EMAIL);
export const signInAsMember = (): Promise<void> => ensureSignedIn(MEMBER_EMAIL);
export const signInAsOutsider = (): Promise<void> => ensureSignedIn(OUTSIDER_EMAIL);

export async function signOut(): Promise<void> {
  await fbSignOut(getAuthClient());
}

// clearFirestore NO toca el Auth emulator → REST DELETE borra todas las cuentas para que
// cada test arranque de cero. Node 22 trae fetch global (sin dep). El header
// `Authorization: Bearer owner` es el que el Auth emulator exige para endpoints admin.
export async function resetAuth(): Promise<void> {
  await fbSignOut(getAuthClient()).catch(() => {});
  const res = await fetch(
    `http://${EMU.host}:${EMU.authPort}/emulator/v1/projects/${EMU.projectId}/accounts`,
    { method: 'DELETE', headers: { Authorization: 'Bearer owner' } },
  );
  if (!res.ok) throw new Error(`resetAuth: ${res.status} ${res.statusText}`);
}
