import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

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

describe('firestore.rules — accessRequests (SPEC-52 F1)', () => {
  const REQ_ID = 'solicitante@example.com';

  it('un usuario autenticado NO puede leer la cola (deny-all)', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: true })
      .firestore();
    await assertFails(getDoc(doc(db, 'accessRequests', REQ_ID)));
  });

  it('un usuario autenticado NO puede escribir la cola (deny-all)', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: true })
      .firestore();
    await assertFails(
      setDoc(doc(db, 'accessRequests', REQ_ID), { email: REQ_ID, status: 'pending' }),
    );
  });

  it('un visitante anónimo NO puede crear una solicitud directo (solo vía CF)', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'accessRequests', REQ_ID), { email: REQ_ID, status: 'pending' }),
    );
  });
});

describe('firestore.rules — consentLog (consent server-authoritative)', () => {
  it('el cliente NO puede LEER su doc resumen de consentLog (deny-all; el ack-proof es server-only)', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: true })
      .firestore();
    await assertFails(getDoc(doc(db, 'consentLog/uid-invited')));
  });

  it('el cliente NO puede FORJAR el ack-proof escribiendo el doc resumen (deny-all)', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: true })
      .firestore();
    // El núcleo de Opción 3: aunque sea su propio uid + allowlisted, no puede
    // mintear el acknowledgedAt que el gate de egreso lee.
    await assertFails(setDoc(doc(db, 'consentLog/uid-invited'), { acknowledgedAt: 123 }));
  });

  it('el cliente tampoco puede escribir el log de eventos (subcolección, {document=**} recursivo)', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: true })
      .firestore();
    await assertFails(
      setDoc(doc(db, 'consentLog/uid-invited/events/e1'), { action: 'acknowledged' }),
    );
  });
});

describe('firestore.rules — backstop de revoke (SPEC-53 F3)', () => {
  // Ambos polos sobre el MISMO usuario para que el test no pase por la razón equivocada:
  // con allowlist/{email} presente accede; tras revocar (borrar el doc, lo que hace la CF
  // revokeAccess vía Admin SDK) las rules lo frenan. Soft revoke: la sesión sigue, pero
  // toda I/O nueva a users/** queda denegada (backstop real, sin heartbeat de checkMyAccess).
  it('un miembro pierde acceso a users/** tras revocar su allowlist/{email}', async () => {
    const db = testEnv
      .authenticatedContext('uid-invited', { email: INVITED, email_verified: true })
      .firestore();

    // Polo positivo: con el seed de allowlist/{INVITED} presente → accede.
    await assertSucceeds(setDoc(doc(db, 'users/uid-invited/notes/n1'), { title: 'antes' }));

    // Revoke: borrar el doc de allowlist (equivalente a lo que hace revokeAccess).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'allowlist', INVITED));
    });

    // Polo negativo: misma sesión, ahora sin allowlist → permission-denied.
    await assertFails(getDoc(doc(db, 'users/uid-invited/notes/n1')));
    await assertFails(setDoc(doc(db, 'users/uid-invited/notes/n2'), { title: 'después' }));
  });
});
