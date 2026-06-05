import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getFns } from './helpers/emulator';
import { clearAll, cleanupTestEnv, seedAllowlist, readAllowlist } from './helpers/firestore';
import { signInAsAdmin, signInAsMember, signOut, resetAuth } from './helpers/users';

// SPEC-55 F9 — revokeAccess: borrado de allowlist/{email} + idempotencia + gating.
// requireAdmin corre ANTES de validar el input → los casos de gating no necesitan email válido.

describe('revokeAccess (E2E)', () => {
  beforeEach(async () => {
    await resetAuth();
    await clearAll();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('admin revoca un miembro existente → ok y el doc desaparece', async () => {
    await seedAllowlist('revoke-me@x.test');
    await signInAsAdmin();
    const res = await httpsCallable(getFns(), 'revokeAccess')({ email: 'revoke-me@x.test' });
    expect(res.data).toEqual({ ok: true });
    expect(await readAllowlist('revoke-me@x.test')).toBeNull();
  });

  it('idempotente: revocar un email inexistente → ok', async () => {
    await signInAsAdmin();
    const res = await httpsCallable(getFns(), 'revokeAccess')({ email: 'ghost@x.test' });
    expect(res.data).toEqual({ ok: true });
  });

  it('no-admin → permission-denied', async () => {
    await signInAsMember();
    await expect(
      httpsCallable(getFns(), 'revokeAccess')({ email: 'x@x.test' }),
    ).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });

  it('sin sesión → unauthenticated', async () => {
    await signOut();
    await expect(
      httpsCallable(getFns(), 'revokeAccess')({ email: 'x@x.test' }),
    ).rejects.toMatchObject({ code: 'functions/unauthenticated' });
  });

  it('email vacío → invalid-argument (siendo admin)', async () => {
    await signInAsAdmin();
    await expect(httpsCallable(getFns(), 'revokeAccess')({ email: '' })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
  });
});
