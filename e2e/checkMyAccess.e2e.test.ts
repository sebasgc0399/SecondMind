import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getFns } from './helpers/emulator';
import { clearAll, cleanupTestEnv, seedAllowlist } from './helpers/firestore';
import {
  signInAsMember,
  signInAsOutsider,
  signOut,
  resetAuth,
  MEMBER_EMAIL,
} from './helpers/users';

// SPEC-55 F7 — checkMyAccess: canario que valida el bootstrap E2E completo
// (cliente → connectFunctionsEmulator → token real → I/O Firestore). AUTENTICADO,
// lee el email del PROPIO token e IGNORA el input → no enumera terceros.

describe('checkMyAccess (E2E)', () => {
  beforeEach(async () => {
    await resetAuth();
    await clearAll();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('autenticado + allowlisted → { authorized: true }', async () => {
    await seedAllowlist(MEMBER_EMAIL);
    await signInAsMember();
    const res = await httpsCallable(getFns(), 'checkMyAccess')();
    expect(res.data).toEqual({ authorized: true });
  });

  it('autenticado NO allowlisted → { authorized: false }', async () => {
    await signInAsOutsider();
    const res = await httpsCallable(getFns(), 'checkMyAccess')();
    expect(res.data).toEqual({ authorized: false });
  });

  it('sin sesión → unauthenticated', async () => {
    await signOut();
    await expect(httpsCallable(getFns(), 'checkMyAccess')()).rejects.toMatchObject({
      code: 'functions/unauthenticated',
    });
  });

  it('no-oráculo: ignora el email del input, responde sobre el token propio', async () => {
    // El tercero (MEMBER) ESTÁ allowlisted; el caller (outsider) NO. Pasar el email del
    // tercero como input NO debe devolver true → la CF mira su propio token, no el input.
    await seedAllowlist(MEMBER_EMAIL);
    await signInAsOutsider();
    const res = await httpsCallable(getFns(), 'checkMyAccess')({ email: MEMBER_EMAIL });
    expect(res.data).toEqual({ authorized: false });
  });
});
