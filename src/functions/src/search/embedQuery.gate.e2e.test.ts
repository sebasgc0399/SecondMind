import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertSemanticConsent } from '../lib/readSemanticConsent';

// SPEC-66 F3 — gate AUTORITATIVO de embedQuery: la query NO se embebe (no sale
// texto a OpenAI) sin reconocimiento afirmativo registrado. Testeamos el assert
// directo contra el Firestore emulator — es exactamente lo que embedQuery invoca
// tras requireVerified + assertAllowlisted. El cliente (useHybridSearch) también
// gatea, pero es solo UX: este assert es la defensa que importa.

const UID = 'embedquery-gate-uid';

describe('embedQuery — gate de consentimiento (SPEC-66 F3)', () => {
  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: 'demo-secondmind' });
  });

  beforeEach(async () => {
    const db = getFirestore();
    await db.recursiveDelete(db.doc(`users/${UID}`));
  });

  it('consentimiento AUSENTE → permission-denied (semantic-search-disabled)', async () => {
    let thrown: unknown;
    try {
      await assertSemanticConsent(UID);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect((thrown as { code?: string }).code).toBe('permission-denied');
    expect((thrown as { details?: { code?: string } }).details?.code).toBe(
      'semantic-search-disabled',
    );
  });

  it('enabled:true SIN acknowledgedAt → permission-denied (exige reconocimiento registrado)', async () => {
    const db = getFirestore();
    await db.doc(`users/${UID}/settings/semanticSearch`).set({ enabled: true });
    await expect(assertSemanticConsent(UID)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('control: enabled:true + acknowledgedAt → resuelve sin throw', async () => {
    const db = getFirestore();
    await db
      .doc(`users/${UID}/settings/semanticSearch`)
      .set({ enabled: true, acknowledgedAt: Date.now() });
    await expect(assertSemanticConsent(UID)).resolves.toBeUndefined();
  });
});
