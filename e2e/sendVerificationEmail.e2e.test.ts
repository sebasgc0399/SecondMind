import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getFns } from './helpers/emulator';
import { clearAll, cleanupTestEnv } from './helpers/firestore';
import { signInAsMember, signOut, resetAuth } from './helpers/users';

// SPEC-65 F2.6 — sendVerificationEmail: AUTENTICADA, REPORTA el fallo (a diferencia del reset NO
// tiene anti-enum: el user es dueño de su email). Con RESEND_API_KEY dummy (emu-secret.mjs) el
// envío FALLA → la CF throwea verify-send-failed (functions/internal): exactamente la señal que
// el reenvío del cliente necesita conservar (useEmailVerificationResend no arranca el cooldown).
// El envío real (HTML propio + landing) se valida en el smoke con throwaway (post-deploy).

const call = () => httpsCallable(getFns(), 'sendVerificationEmail')();

describe('sendVerificationEmail (E2E)', () => {
  beforeEach(async () => {
    await resetAuth();
    await clearAll();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('sin sesión → unauthenticated', async () => {
    await signOut();
    await expect(call()).rejects.toMatchObject({ code: 'functions/unauthenticated' });
  });

  it('autenticado + envío fallido (RESEND dummy) → throwea verify-send-failed (reporta el fallo)', async () => {
    await signInAsMember();
    await expect(call()).rejects.toMatchObject({
      code: 'functions/internal',
      details: { code: 'verify-send-failed' },
    });
  });

  it('rate-limit por uid: la 3ª llamada en el minuto → resource-exhausted', async () => {
    await signInAsMember();
    // perMinute: 2 → las 2 primeras pasan el rate-limit (y fallan con verify-send-failed por la
    // dummy key); la 3ª se corta en el rate-limit ANTES del envío.
    await call().catch(() => {});
    await call().catch(() => {});
    await expect(call()).rejects.toMatchObject({ code: 'functions/resource-exhausted' });
  });
});
