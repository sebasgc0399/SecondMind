import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// SPEC-50 F4 — test de las security rules de allowlist contra el emulador.
// Corre vía `npm run test:rules` (firebase emulators:exec). NO entra en el
// `npm test` default (excluido en vite.config.ts) porque requiere el emulador.
// Proyecto demo-* → el emulador no exige credenciales reales.

const INVITED = 'invited@example.com';
const OUTSIDER = 'outsider@example.com';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-secondmind',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed de la allowlist con un email invitado (bypass de las rules).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'allowlist', INVITED), { addedAt: 0 });
  });
});

describe('firestore.rules — allowlist (SPEC-50 F4)', () => {
  it('verificado + allowlisted lee/escribe sus propios users/**', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: true })
      .firestore();
    await assertSucceeds(setDoc(doc(db, 'users/uid-invited/notes/n1'), { title: 'hola' }));
    await assertSucceeds(getDoc(doc(db, 'users/uid-invited/notes/n1')));
  });

  it('verificado pero NO allowlisted recibe permission-denied', async () => {
    const db = testEnv
      .authenticatedContext('uid-outsider', { email: OUTSIDER, email_verified: true })
      .firestore();
    await assertFails(getDoc(doc(db, 'users/uid-outsider/notes/n1')));
    await assertFails(setDoc(doc(db, 'users/uid-outsider/notes/n1'), { title: 'no' }));
  });

  it('allowlisted pero NO verificado recibe permission-denied (regresión C1)', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: false })
      .firestore();
    await assertFails(getDoc(doc(db, 'users/uid-invited/notes/n1')));
  });

  it('no puede leer los datos de OTRO usuario aunque esté allowlisted (owner check)', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: true })
      .firestore();
    await assertFails(getDoc(doc(db, 'users/uid-otro/notes/n1')));
  });

  it('el cliente NO puede leer la colección allowlist (deny-all)', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: true })
      .firestore();
    await assertFails(getDoc(doc(db, 'allowlist', INVITED)));
  });
});
