import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
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
// Firestore con cache persistente (IndexedDB) + multi-tab manager (SPEC-56 F1).
// El SDK asume durabilidad de writes (mutation-queue durable) y lectura offline
// (rehidrata TinyBase tras reload). `persistentMultipleTabManager` es necesario
// porque hay 2º webview del mismo origin (Tauri `capture`) + PWA multi-pestaña.
// `cacheSizeBytes` va DENTRO de `persistentLocalCache` (pasarlo top-level junto a
// `localCache` tira error de init). NUNCA `CACHE_SIZE_UNLIMITED` (D3).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: 40 * 1024 * 1024,
  }),
});
export const functions = getFunctions(app, 'us-central1');
