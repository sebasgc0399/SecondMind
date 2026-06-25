import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { backfillEmbeddingsHandler } from './backfillEmbeddings';

// SPEC-66 F6 — backfill al habilitar. Verifica: (1) gate de consentimiento
// (no backfillea sin reconocimiento), (2) que reusa createNoteEmbedding vía la
// dep `embed` (UNA sola fuente de verdad — el spy lo prueba sin llamar a OpenAI),
// (3) el conteo processed/skipped y el filtrado de notas vacías.

const UID = 'backfill-uid';
const EMAIL = `${UID}@x.test`;

function fakeRequest(cursor?: string): CallableRequest<{ cursor?: string }> {
  return {
    auth: { uid: UID, token: { email: EMAIL, email_verified: true } },
    data: cursor ? { cursor } : {},
  } as unknown as CallableRequest<{ cursor?: string }>;
}

async function seedConsentAndAllowlist() {
  const db = getFirestore();
  await db.collection('allowlist').doc(EMAIL).set({});
  // enabled en el doc vivo; el ack-proof en el doc resumen deny-all (de donde el
  // gate lo lee tras Opción 3).
  await db.doc(`users/${UID}/settings/semanticSearch`).set({ enabled: true });
  await db.doc(`consentLog/${UID}`).set({ acknowledgedAt: Date.now() });
}

describe('backfillEmbeddings (SPEC-66 F6)', () => {
  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: 'demo-secondmind' });
  });

  beforeEach(async () => {
    const db = getFirestore();
    await db.recursiveDelete(db.doc(`users/${UID}`));
    await db.collection('allowlist').doc(EMAIL).delete();
    // El ack-proof vive fuera de users/{uid} (top-level deny-all) → limpiarlo aparte.
    await db.recursiveDelete(db.doc(`consentLog/${UID}`));
  });

  it('SIN consentimiento → permission-denied y NO backfillea', async () => {
    const db = getFirestore();
    await db.collection('allowlist').doc(EMAIL).set({}); // allowlisted pero sin consentimiento
    const embed = vi.fn();
    await expect(backfillEmbeddingsHandler(fakeRequest(), { embed })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(embed).not.toHaveBeenCalled();
  });

  it('embebe las notas con contentPlain reusando createNoteEmbedding (vía deps.embed), saltea las vacías', async () => {
    const db = getFirestore();
    await seedConsentAndAllowlist();
    await db.doc(`users/${UID}/notes/a`).set({ contentPlain: 'nota uno' });
    await db.doc(`users/${UID}/notes/b`).set({ contentPlain: 'nota dos' });
    await db.doc(`users/${UID}/notes/c`).set({ contentPlain: '   ' }); // vacía → skip

    const embed = vi.fn().mockResolvedValue('created');
    const res = await backfillEmbeddingsHandler(fakeRequest(), { embed });

    expect(embed).toHaveBeenCalledTimes(2);
    expect(embed).toHaveBeenCalledWith(UID, 'a', 'nota uno');
    expect(embed).toHaveBeenCalledWith(UID, 'b', 'nota dos');
    expect(res.processed).toBe(2);
    expect(res.skipped).toBe(1);
    expect(res.done).toBe(true);
  });

  it('idempotente: createNoteEmbedding que devuelve "skipped" cuenta como skipped, no processed', async () => {
    const db = getFirestore();
    await seedConsentAndAllowlist();
    await db.doc(`users/${UID}/notes/a`).set({ contentPlain: 'ya embebida' });

    const embed = vi.fn().mockResolvedValue('skipped');
    const res = await backfillEmbeddingsHandler(fakeRequest(), { embed });

    expect(res.processed).toBe(0);
    expect(res.skipped).toBe(1);
  });
});
