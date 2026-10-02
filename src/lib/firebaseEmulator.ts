// SPEC-69 T4 — modo emulador de la app (decisión pura, sin Firebase, testeable en node).
// Modo emulador ⇔ dev server con `vite --mode emulator` (E0-T4-f). `firebase.ts` lo evalúa
// como `import.meta.env.DEV && resolveEmulatorMode(import.meta.env)`: en un build de
// producción `DEV` se reemplaza por `false` y toda la rama del emulador (con estas
// constantes) se elimina del bundle. Vite fija MODE desde `--mode` después de cargar las
// variables de entorno del usuario, así que ninguna `VITE_*` puede activarlo.

export const EMULATOR_MODE = 'emulator';
export const EMULATOR_HOST = '127.0.0.1'; // NO 'localhost' → evita el ::1 IPv6 en Windows
export const EMULATOR_AUTH_URL = 'http://127.0.0.1:9099';
export const EMULATOR_FIRESTORE_PORT = 8080;
export const EMULATOR_FUNCTIONS_PORT = 5001;

// Config falsa del proyecto `demo-secondmind`, que solo existe en el Emulator Suite (I3). En
// modo emulador reemplaza entera a los `VITE_FIREBASE_*`: los valores reales de `.env.local`
// nunca se mezclan con los emuladores. Sin measurementId (no hay Analytics en el emulador).
export const EMULATOR_FIREBASE_CONFIG = {
  apiKey: 'fake-api-key',
  authDomain: 'demo-secondmind.firebaseapp.com',
  projectId: 'demo-secondmind',
  storageBucket: 'demo-secondmind.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
} as const;

export interface EmulatorEnv {
  DEV: boolean;
  MODE: string;
}

// true ⇔ dev server (DEV) Y modo `emulator`.
export function resolveEmulatorMode(env: EmulatorEnv): boolean {
  return env.DEV === true && env.MODE === EMULATOR_MODE;
}

export interface ViteInvocation {
  command: string;
  mode: string;
  isPreview?: boolean;
  nodeEnv?: string;
}

// Lo llama `vite.config.ts` (I2). `--mode emulator` solo vale en el dev server con DEV true:
// en un build, en `vite preview` o con NODE_ENV=production (Vite deja DEV=false) la app no
// entraría en modo emulador y usaría la config real de `.env.local` sin chip. Se aborta.
export function assertEmulatorModeAllowed({
  command,
  mode,
  isPreview = false,
  nodeEnv,
}: ViteInvocation): void {
  if (mode !== EMULATOR_MODE) return;
  if (command !== 'serve' || isPreview || nodeEnv === 'production') {
    throw new Error(
      `[vite.config] --mode emulator es solo para el dev server (npm run dev:emu:app) con ` +
        `NODE_ENV distinto de production (recibido command "${command}"` +
        `${isPreview ? ' preview' : ''}, NODE_ENV "${nodeEnv ?? ''}").`,
    );
  }
}
