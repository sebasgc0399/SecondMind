import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getFns } from './helpers/emulator';
import {
  clearAll,
  cleanupTestEnv,
  seedAllowlist,
  seedAccessRequest,
  readAccessRequest,
} from './helpers/firestore';
import { signOut, resetAuth } from './helpers/users';

// SPEC-55 F11 — submitAccessRequest: callable PÚBLICA (sin auth). No-oráculo + dedup +
// rate-limit por IP + invalid-argument. beforeEach(clearAll) resetea el bucket de rateLimits.

const submit = (data: unknown) => httpsCallable(getFns(), 'submitAccessRequest')(data);

describe('submitAccessRequest (E2E)', () => {
  beforeEach(async () => {
    await resetAuth();
    await clearAll();
    await signOut(); // pública: sin sesión
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('público (sin sesión) → ok y crea accessRequest pending', async () => {
    const res = await submit({ email: 'new@x.test' });
    expect(res.data).toEqual({ ok: true });
    const req = await readAccessRequest('new@x.test');
    expect(req?.status).toBe('pending');
    expect(req?.email).toBe('new@x.test');
  });

  it('no-oráculo: misma respuesta para nuevo / duplicado / ya-allowlisted', async () => {
    await seedAllowlist('member@x.test');
    const r1 = await submit({ email: 'fresh@x.test' }); // nuevo
    const r2 = await submit({ email: 'fresh@x.test' }); // duplicado
    const r3 = await submit({ email: 'member@x.test' }); // ya allowlisted
    expect(r1.data).toEqual({ ok: true });
    expect(r2.data).toEqual({ ok: true });
    expect(r3.data).toEqual({ ok: true });
  });

  it('dedup: una segunda submit no pisa el status existente', async () => {
    await seedAccessRequest('dup@x.test', { status: 'rejected' });
    await submit({ email: 'dup@x.test' });
    expect((await readAccessRequest('dup@x.test'))?.status).toBe('rejected'); // no-op
  });

  it('rate-limit por IP: superar perMinute (3) → resource-exhausted', async () => {
    // Misma IP (mismo cliente) → mismo bucket. 6 emails distintos; tras superar el límite,
    // al menos una de las extra debe dar resource-exhausted. No afirmamos el índice exacto
    // (absorbe el borde de minuto del slot).
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => submit({ email: `rl${i}@x.test` })),
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.length).toBeGreaterThan(0);
    expect(
      rejected.some(
        (r) => (r.reason as { code?: string })?.code === 'functions/resource-exhausted',
      ),
    ).toBe(true);
  });

  it('invalid-argument: email malformado', async () => {
    await expect(submit({ email: 'not-an-email' })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
  });

  it('invalid-argument: motivo > 280 chars', async () => {
    await expect(submit({ email: 'x@x.test', motivo: 'a'.repeat(281) })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
  });
});
