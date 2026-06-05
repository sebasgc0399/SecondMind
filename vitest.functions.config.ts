import { defineConfig } from 'vitest/config';

// SPEC-55 — config dedicada del harness E2E de callables. Corre vía
// `npm run test:functions` (firebase emulators:exec con functions+auth+firestore).
// Aislada del `npm test` default (que excluye `**/*.e2e.test.ts` en vite.config.ts)
// porque requiere los 3 emuladores levantados. Timeouts amplios: el boot del emulador
// + el login contra el Auth emulator suman latencia (peor en el primer arranque en CI).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['e2e/**/*.e2e.test.ts'],
    testTimeout: 20000,
    hookTimeout: 40000,
    // Los 5 archivos comparten UN solo emulador (Firestore + Auth). Correrlos en paralelo
    // hace que el clearAll/resetAuth de un archivo pise el estado de otro, y satura el
    // cold-start del Functions emulator (→ 404 not-found). Serializamos a nivel archivo;
    // dentro de cada archivo los tests ya corren en orden.
    fileParallelism: false,
  },
});
