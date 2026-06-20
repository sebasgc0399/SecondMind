import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getFns } from './helpers/emulator';
import {
  clearAll,
  cleanupTestEnv,
  seedAllowlist,
  seedAccessRequest,
  seedUserSubcollections,
  seedUserSecret,
  seedRateLimit,
  countUserSubdocs,
  countUserSecrets,
  countRateLimitsFor,
  readAllowlist,
  readAccessRequest,
} from './helpers/firestore';
import {
  signInAsMember,
  signOut,
  resetAuth,
  currentUid,
  authUserExists,
  MEMBER_EMAIL,
} from './helpers/users';

// SPEC-64 F1 — deleteAccount: wipe total e irreversible (self-service). El RECHAZO del
// gate de reauth por auth_time viejo se valida por UNIT (reauthGate.test.ts): el Auth
// emulator emite tokens siempre frescos, así que el rechazo por tiempo no es reproducible
// acá. El happy path cubre la ACEPTACIÓN del gate (token fresco → no rechaza).

describe('deleteAccount (E2E)', () => {
  beforeEach(async () => {
    await resetAuth();
    await clearAll();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('happy path: borra TODA la PII (incl. doc fantasma users/{uid}) + Auth user', async () => {
    await signInAsMember();
    const uid = currentUid();
    await seedUserSubcollections(uid); // NO crea users/{uid} raíz → fantasma
    await seedUserSecret(uid);
    await seedRateLimit(uid);
    await seedAllowlist(MEMBER_EMAIL);
    await seedAccessRequest(MEMBER_EMAIL, { email: MEMBER_EMAIL });

    // pre-condición: hay datos sembrados
    expect(await countUserSubdocs(uid)).toBeGreaterThan(0);
    expect(await countUserSecrets(uid)).toBe(1);
    expect(await countRateLimitsFor(uid)).toBe(2);

    const res = await httpsCallable(getFns(), 'deleteAccount')();
    expect(res.data).toEqual({ ok: true });

    // wipe verificado colección por colección
    expect(await countUserSubdocs(uid)).toBe(0); // phantom doc: subcolecciones borradas
    expect(await countUserSecrets(uid)).toBe(0);
    expect(await countRateLimitsFor(uid)).toBe(0);
    expect(await readAllowlist(MEMBER_EMAIL)).toBeNull();
    expect(await readAccessRequest(MEMBER_EMAIL)).toBeNull();
    expect(await authUserExists(uid)).toBe(false);
  });

  it('sin sesión → unauthenticated (no borra nada)', async () => {
    await signOut();
    await expect(httpsCallable(getFns(), 'deleteAccount')()).rejects.toMatchObject({
      code: 'functions/unauthenticated',
    });
  });

  it('idempotente: re-ejecutable sobre estado parcial (datos ya borrados) → ok', async () => {
    await signInAsMember();
    const uid = currentUid();
    // estado "post-kill parcial": solo queda allowlist; el resto ya fue borrado en un
    // intento previo. Los pasos sobre lo ausente deben ser no-op (recursiveDelete vacío,
    // .delete() sobre inexistente).
    await seedAllowlist(MEMBER_EMAIL);

    const res = await httpsCallable(getFns(), 'deleteAccount')();
    expect(res.data).toEqual({ ok: true });
    expect(await readAllowlist(MEMBER_EMAIL)).toBeNull();
    expect(await authUserExists(uid)).toBe(false);
  });
});
