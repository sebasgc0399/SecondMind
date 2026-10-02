import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import {
  EMULATOR_AUTH_URL,
  EMULATOR_FIREBASE_CONFIG,
  EMULATOR_FIRESTORE_PORT,
  EMULATOR_FUNCTIONS_PORT,
  EMULATOR_HOST,
  resolveEmulatorMode,
} from '@/lib/firebaseEmulator';

// SPEC-69 T4 (E0-T4-f): modo emulador solo en el dev server con `vite --mode emulator`. El
// `DEV &&` literal va acá (no solo dentro del helper) para que el build de producción lo
// reduzca a `false` y elimine la rama entera, config falsa incluida.
export const isEmulatorMode =
  import.meta.env.DEV &&
  resolveEmulatorMode({ DEV: import.meta.env.DEV, MODE: import.meta.env.MODE });

// En modo emulador se ignoran todos los `VITE_FIREBASE_*`: config falsa `demo-secondmind` (I3).
const firebaseConfig = isEmulatorMode
  ? EMULATOR_FIREBASE_CONFIG
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
if (isEmulatorMode) {
  connectAuthEmulator(auth, EMULATOR_AUTH_URL, { disableWarnings: true });
}
// Firestore con cache persistente (IndexedDB) + multi-tab manager (SPEC-56 F1).
// El SDK asume durabilidad de writes (mutation-queue durable) y lectura offline
// (rehidrata TinyBase tras reload). `persistentMultipleTabManager` es necesario
// porque hay 2º webview del mismo origin (Tauri `capture`) + PWA multi-pestaña.
// `cacheSizeBytes` va DENTRO de `persistentLocalCache` (pasarlo top-level junto a
// `localCache` tira error de init). NUNCA `CACHE_SIZE_UNLIMITED` (D3).
// En modo emulador la cache es en memoria: el seed resetea los datos en cada corrida y
// una cache persistente mostraría docs viejos.
export const db = initializeFirestore(app, {
  localCache: isEmulatorMode
    ? memoryLocalCache()
    : persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: 40 * 1024 * 1024,
      }),
});
if (isEmulatorMode) {
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_FIRESTORE_PORT);
}
export const functions = getFunctions(app, 'us-central1');
if (isEmulatorMode) {
  connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_FUNCTIONS_PORT);
}
