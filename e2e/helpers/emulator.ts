import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';

// SPEC-55 F5 — app cliente DEDICADA al harness, apuntando a los emuladores (NO la de
// src/lib/firebase.ts, que apunta a prod `secondmindv1`). projectId `demo-*` → el emulador
// no exige credenciales reales. Memoizada e idempotente ante re-imports: vitest corre cada
// archivo en su propio worker, así que cada archivo tiene su singleton; el `getApps().find`
// + cache evita el `app/duplicate-app` si dos archivos compartieran proceso.

const PROJECT_ID = 'demo-secondmind';
const APP_NAME = 'e2e-harness';
const HOST = '127.0.0.1'; // NO 'localhost' → evita el ::1 IPv6 inconsistente en Windows
const AUTH_PORT = 9099;
const FN_PORT = 5001;
const FIRESTORE_PORT = 8080;
const REGION = 'us-central1'; // la región que declaran las callables de access

let cached: { app: FirebaseApp; auth: Auth; functions: Functions } | null = null;

function init() {
  if (cached) return cached;
  const app =
    getApps().find((a) => a.name === APP_NAME) ??
    initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' }, APP_NAME);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:${AUTH_PORT}`, { disableWarnings: true });
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, HOST, FN_PORT);
  cached = { app, auth, functions };
  return cached;
}

export function getAuthClient(): Auth {
  return init().auth;
}

export function getFns(): Functions {
  return init().functions;
}

export const EMU = {
  projectId: PROJECT_ID,
  host: HOST,
  authPort: AUTH_PORT,
  fnPort: FN_PORT,
  firestorePort: FIRESTORE_PORT,
} as const;
