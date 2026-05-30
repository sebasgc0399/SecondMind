import { defineConfig } from 'vitest/config';

// Config dedicada para el test de security rules (SPEC-50 F4). Se corre con
// `npm run test:rules` bajo `firebase emulators:exec` — requiere el emulador
// de Firestore levantado. Aislada del `npm test` default (que excluye este
// archivo en vite.config.ts) porque ese corre sin emulador.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['firestore.rules.test.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
