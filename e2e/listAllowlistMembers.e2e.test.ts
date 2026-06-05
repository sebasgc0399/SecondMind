import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getFns } from './helpers/emulator';
import { clearAll, cleanupTestEnv, seedAllowlist } from './helpers/firestore';
import { signInAsAdmin, signInAsMember, signOut, resetAuth } from './helpers/users';

// SPEC-55 F8 (+ verificación de F4: el caso admin prueba que .secret.local se inyectó y
// adminEmail.value() resuelve). Gating admin + shape del DTO + orden addedAt desc.

interface Member {
  email: string;
  addedAt: number | null;
}

describe('listAllowlistMembers (E2E)', () => {
  beforeEach(async () => {
    await resetAuth();
    await clearAll();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('admin → { members } con DTOs ordenados por addedAt desc', async () => {
    await seedAllowlist('a@x.test', 100);
    await seedAllowlist('b@x.test', 300);
    await seedAllowlist('c@x.test', 200);
    await signInAsAdmin();
    const res = await httpsCallable(getFns(), 'listAllowlistMembers')();
    const { members } = res.data as { members: Member[] };
    expect(members.map((m) => m.email)).toEqual(['b@x.test', 'c@x.test', 'a@x.test']);
    expect(members[0]).toEqual({ email: 'b@x.test', addedAt: 300 });
  });

  it('no-admin autenticado → permission-denied', async () => {
    await signInAsMember();
    await expect(httpsCallable(getFns(), 'listAllowlistMembers')()).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
  });

  it('sin sesión → unauthenticated', async () => {
    await signOut();
    await expect(httpsCallable(getFns(), 'listAllowlistMembers')()).rejects.toMatchObject({
      code: 'functions/unauthenticated',
    });
  });
});
