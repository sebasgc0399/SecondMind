// SPEC-69 T4 — decisión pura del modo emulador (sin Firebase, testeable en node).
// `firebase.ts` la evalúa como `import.meta.env.DEV && resolveEmulatorMode(import.meta.env)`:
// en un build de producción `DEV` se reemplaza por `false` y toda la rama del emulador
// (con estas constantes) se elimina del bundle.

export const EMULATOR_HOST = '127.0.0.1'; // NO 'localhost' → evita el ::1 IPv6 en Windows
export const EMULATOR_AUTH_URL = 'http://127.0.0.1:9099';
export const EMULATOR_FIRESTORE_PORT = 8080;
export const EMULATOR_FUNCTIONS_PORT = 5001;

export interface EmulatorEnv {
  DEV: boolean;
  VITE_USE_EMULATOR?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
}

// true ⇔ dev server Y flag explícito 'true'. Con el flag activo exige un projectId `demo-*`
// (I3): un projectId real con los emuladores conectados mezclaría entornos, así que se aborta
// el arranque en vez de seguir.
export function resolveEmulatorMode(env: EmulatorEnv): boolean {
  if (!env.DEV || env.VITE_USE_EMULATOR !== 'true') return false;
  const projectId = env.VITE_FIREBASE_PROJECT_ID ?? '';
  if (!projectId.startsWith('demo-')) {
    throw new Error(
      `[emulator] VITE_USE_EMULATOR=true exige un projectId demo-* (recibido "${projectId}").`,
    );
  }
  return true;
}
