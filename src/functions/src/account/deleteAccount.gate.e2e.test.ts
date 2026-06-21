import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { deleteAccountHandler } from './deleteAccount';

// SPEC-64 F1 — test del GATE de reauth por el camino crítico de seguridad (D3).
// Invoca el handler DIRECTO con un auth_time VIEJO fabricado (imposible por wire: el
// Auth emulator solo emite tokens frescos) y verifica las DOS mitades:
//   (1) lanza reauth-required, y
//   (2) Firestore queda INTACTO — el gate rechaza ANTES de cualquier I/O.
// Si el gate fallara abierto, se borraría una cuenta sin reauth reciente: el ataque de
// sesión secuestrada que D3 existe para frenar. Usa el Admin SDK contra el Firestore
// emulator (FIRESTORE_EMULATOR_HOST lo inyecta `firebase emulators:exec`).

const UID = 'reauth-gate-uid';
const nowS = (): number => Math.floor(Date.now() / 1000);

function fakeRequest(uid: string, authTimeSeconds: number): CallableRequest<void> {
  return {
    auth: { uid, token: { auth_time: authTimeSeconds, email: `${uid}@x.test` } },
    data: undefined,
  } as unknown as CallableRequest<void>;
}

describe('deleteAccount — gate de reauth (handler directo)', () => {
  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: 'demo-secondmind' });
  });

  beforeEach(async () => {
    const db = getFirestore();
    await db.recursiveDelete(db.doc(`users/${UID}`));
    await db.recursiveDelete(db.doc(`userSecrets/${UID}`));
    await db.doc(`users/${UID}/notes/n1`).set({ title: 'no-borrar' });
    await db.doc(`userSecrets/${UID}/keys/anthropic`).set({ ciphertext: 'x' });
  });

  it('auth_time VIEJO → reauth-required Y Firestore INTACTO (nada borrado)', async () => {
    const db = getFirestore();
    let thrown: unknown;
    try {
      await deleteAccountHandler(fakeRequest(UID, nowS() - 1000)); // 1000s > 300s
    } catch (e) {
      thrown = e;
    }
    // (1) lanzó reauth-required (grpc failed-precondition + slug en details.code)
    expect(thrown).toBeDefined();
    expect((thrown as { code?: string }).code).toBe('failed-precondition');
    expect((thrown as { details?: { code?: string } }).details?.code).toBe('reauth-required');
    // (2) Firestore INTACTO: el gate rechazó antes de tocar nada
    const notes = await db.collection(`users/${UID}/notes`).get();
    const keys = await db.collection(`userSecrets/${UID}/keys`).get();
    expect(notes.size).toBe(1);
    expect(keys.size).toBe(1);
  });

  it('control: auth_time FRESCO → no rechaza por reauth, borra (Firestore vacío)', async () => {
    const db = getFirestore();
    const res = await deleteAccountHandler(fakeRequest(UID, nowS()));
    expect(res).toEqual({ ok: true });
    const notes = await db.collection(`users/${UID}/notes`).get();
    const keys = await db.collection(`userSecrets/${UID}/keys`).get();
    expect(notes.size).toBe(0);
    expect(keys.size).toBe(0);
  });
});
