import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getFns } from './helpers/emulator';
import { clearAll, cleanupTestEnv } from './helpers/firestore';
import { signInAsMember, resetAuth, MEMBER_EMAIL } from './helpers/users';

// SPEC-65 F2.6 — sendResetEmail: PÚBLICA, ANTI-ENUMERACIÓN ESTRICTA. El test (c) es el crítico:
// un email EXISTENTE con envío fallido (RESEND dummy) devuelve { ok: true }, IDÉNTICO a un email
// inexistente → el cliente no puede distinguir existencia. Solo formato + rate-limit (evaluados
// ANTES del generateLink, agnósticos a la existencia) burbujean; todo lo posterior → { ok: true }.
// La confirmación empírica de que el code real es auth/email-not-found se hace en el smoke prod.

const call = (email: unknown) => httpsCallable(getFns(), 'sendResetEmail')({ email });

describe('sendResetEmail (E2E)', () => {
  beforeEach(async () => {
    await resetAuth();
    await clearAll();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('(a) email inexistente bien formado → { ok: true } (no revela)', async () => {
    const res = await call('ghost@x.test');
    expect(res.data).toEqual({ ok: true });
  });

  it('(b) email malformado / vacío → invalid-argument (formato, NO existencia)', async () => {
    await expect(call('not-an-email')).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
    await expect(call('')).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });

  it('(c) [grieta cerrada] email EXISTENTE + envío fallido → { ok: true }, INDISTINGUIBLE del inexistente', async () => {
    // signInAsMember crea MEMBER_EMAIL en el Auth emulator → el email EXISTE. sendResetEmail es
    // público (ignora la sesión). generatePasswordResetLink resuelve, pero sendEmail falla (dummy
    // key) → la CF traga y devuelve { ok: true }: idéntico al caso inexistente (a) → sin oráculo.
    await signInAsMember();
    const existing = await call(MEMBER_EMAIL);
    const ghost = await call('ghost2@x.test');
    expect(existing.data).toEqual({ ok: true });
    expect(existing.data).toEqual(ghost.data); // observable idéntico existente vs inexistente
  });

  it('(d) rate-limit por IP: la 4ª llamada en el minuto → resource-exhausted', async () => {
    // perMinute: 3 → las 3 primeras pasan (y devuelven { ok: true }); la 4ª se corta en el
    // rate-limit ANTES del generateLink (agnóstico a la existencia, puede burbujear).
    await call('rl@x.test');
    await call('rl@x.test');
    await call('rl@x.test');
    await expect(call('rl@x.test')).rejects.toMatchObject({ code: 'functions/resource-exhausted' });
  });
});
