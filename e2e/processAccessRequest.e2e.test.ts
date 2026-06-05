import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getFns } from './helpers/emulator';
import {
  clearAll,
  cleanupTestEnv,
  seedAllowlist,
  seedAccessRequest,
  seedConfig,
  readAllowlist,
  readAccessRequest,
  countAllowlist,
} from './helpers/firestore';
import { signInAsAdmin, signInAsMember, signOut, resetAuth } from './helpers/users';

// SPEC-55 F10 (el crítico) — processAccessRequest: capacity transaccional + idempotencia +
// gating. Cada aserción se verifica contra el estado Firestore post-invocación.

const call = (data: unknown) => httpsCallable(getFns(), 'processAccessRequest')(data);

describe('processAccessRequest (E2E)', () => {
  beforeEach(async () => {
    await resetAuth();
    await clearAll();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('approve bajo límite → allowlist creado + request approved', async () => {
    await seedConfig(10);
    await seedAccessRequest('new@x.test', { status: 'pending' });
    await signInAsAdmin();
    const res = await call({ id: 'new@x.test', action: 'approve' });
    expect(res.data).toEqual({ ok: true });
    expect(await readAllowlist('new@x.test')).not.toBeNull();
    expect((await readAccessRequest('new@x.test'))?.status).toBe('approved');
  });

  it('approve sobre límite (beta llena, email nuevo) → resource-exhausted, allowlist no crece', async () => {
    await seedConfig(2);
    await seedAllowlist('m1@x.test');
    await seedAllowlist('m2@x.test'); // current = 2 = maxUsers
    await seedAccessRequest('new@x.test', { status: 'pending' });
    await signInAsAdmin();
    await expect(call({ id: 'new@x.test', action: 'approve' })).rejects.toMatchObject({
      code: 'functions/resource-exhausted',
    });
    expect(await countAllowlist()).toBe(2);
    expect((await readAccessRequest('new@x.test'))?.status).toBe('pending');
  });

  it('idempotencia: beta llena + ya-miembro → ok sin consumir slot', async () => {
    await seedConfig(2);
    await seedAllowlist('m1@x.test');
    await seedAllowlist('member@x.test'); // current = 2 = maxUsers, incluye al solicitante
    await seedAccessRequest('member@x.test', { status: 'pending' });
    await signInAsAdmin();
    const res = await call({ id: 'member@x.test', action: 'approve' });
    expect(res.data).toEqual({ ok: true });
    expect(await countAllowlist()).toBe(2); // no creció
    expect((await readAccessRequest('member@x.test'))?.status).toBe('approved');
  });

  it('reject → status rejected, allowlist intacta', async () => {
    await seedAccessRequest('rej@x.test', { status: 'pending' });
    await signInAsAdmin();
    const res = await call({ id: 'rej@x.test', action: 'reject' });
    expect(res.data).toEqual({ ok: true });
    expect((await readAccessRequest('rej@x.test'))?.status).toBe('rejected');
    expect(await readAllowlist('rej@x.test')).toBeNull();
  });

  it('not-found: id inexistente', async () => {
    await seedConfig(10);
    await signInAsAdmin();
    await expect(call({ id: 'ghost@x.test', action: 'approve' })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
  });

  it('no-admin → permission-denied', async () => {
    await signInAsMember();
    await expect(call({ id: 'x@x.test', action: 'approve' })).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
  });

  it('sin sesión → unauthenticated', async () => {
    await signOut();
    await expect(call({ id: 'x@x.test', action: 'approve' })).rejects.toMatchObject({
      code: 'functions/unauthenticated',
    });
  });

  it('invalid-argument: action inválida (siendo admin)', async () => {
    await signInAsAdmin();
    await expect(call({ id: 'x@x.test', action: 'bogus' })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
  });
});
