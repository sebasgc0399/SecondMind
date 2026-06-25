import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { deleteAllUserEmbeddings, handleSemanticConsentChange } from './deleteUserEmbeddings';

// SPEC-66 F7 — bulk-delete de embeddings al desactivar (D4-D-B). Dos cosas:
//  (1) deleteAllUserEmbeddings purga la colección entera (contra el emulador).
//  (2) handleSemanticConsentChange dispara la purga SOLO en la transición
//      enabled true→false (incluido el borrado del doc), nunca al activar / sin
//      cambio — el spy verifica el guard sin tocar Firestore.

const UID = 'consent-change-uid';

function changeEvent(
  userId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
) {
  return {
    params: { userId },
    data: { before: { data: () => before }, after: { data: () => after } },
  };
}

describe('deleteAllUserEmbeddings (SPEC-66 F7)', () => {
  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: 'demo-secondmind' });
  });

  beforeEach(async () => {
    const db = getFirestore();
    await db.recursiveDelete(db.doc(`users/${UID}`));
  });

  it('purga toda la colección users/{uid}/embeddings y devuelve el conteo', async () => {
    const db = getFirestore();
    await db.doc(`users/${UID}/embeddings/n1`).set({ vector: [0.1, 0.2] });
    await db.doc(`users/${UID}/embeddings/n2`).set({ vector: [0.3, 0.4] });
    await db.doc(`users/${UID}/embeddings/n3`).set({ vector: [0.5, 0.6] });

    const deleted = await deleteAllUserEmbeddings(UID);

    expect(deleted).toBe(3);
    const snap = await db.collection(`users/${UID}/embeddings`).get();
    expect(snap.empty).toBe(true);
  });

  it('idempotente: sin embeddings → devuelve 0, sin error', async () => {
    expect(await deleteAllUserEmbeddings(UID)).toBe(0);
  });
});

describe('handleSemanticConsentChange — guard de transición + log de estado (SPEC-66 F7 + consent server-auth)', () => {
  it('enabled true→false → purga + loggea "disabled"', async () => {
    const deleteEmbeddings = vi.fn().mockResolvedValue(0);
    const logStateChange = vi.fn().mockResolvedValue(undefined);
    await handleSemanticConsentChange(
      changeEvent(UID, { enabled: true, acknowledgedAt: 1 }, { enabled: false, acknowledgedAt: 1 }),
      { deleteEmbeddings, logStateChange },
    );
    expect(deleteEmbeddings).toHaveBeenCalledWith(UID);
    expect(logStateChange).toHaveBeenCalledWith(UID, 'disabled');
  });

  it('enabled true→(doc borrado) → purga + loggea "disabled" (consentimiento retirado)', async () => {
    const deleteEmbeddings = vi.fn().mockResolvedValue(0);
    const logStateChange = vi.fn().mockResolvedValue(undefined);
    await handleSemanticConsentChange(
      changeEvent(UID, { enabled: true, acknowledgedAt: 1 }, undefined),
      { deleteEmbeddings, logStateChange },
    );
    expect(deleteEmbeddings).toHaveBeenCalledWith(UID);
    expect(logStateChange).toHaveBeenCalledWith(UID, 'disabled');
  });

  it('activar (ausente→enabled:true) → NO purga, loggea "enabled"', async () => {
    const deleteEmbeddings = vi.fn().mockResolvedValue(0);
    const logStateChange = vi.fn().mockResolvedValue(undefined);
    await handleSemanticConsentChange(
      changeEvent(UID, undefined, { enabled: true, acknowledgedAt: 1 }),
      { deleteEmbeddings, logStateChange },
    );
    expect(deleteEmbeddings).not.toHaveBeenCalled();
    expect(logStateChange).toHaveBeenCalledWith(UID, 'enabled');
  });

  it('sin cambio (enabled:true→true) → NO purga, NO loggea', async () => {
    const deleteEmbeddings = vi.fn().mockResolvedValue(0);
    const logStateChange = vi.fn().mockResolvedValue(undefined);
    await handleSemanticConsentChange(
      changeEvent(UID, { enabled: true, acknowledgedAt: 1 }, { enabled: true, acknowledgedAt: 1 }),
      { deleteEmbeddings, logStateChange },
    );
    expect(deleteEmbeddings).not.toHaveBeenCalled();
    expect(logStateChange).not.toHaveBeenCalled();
  });

  it('fallo al loggear el estado NO bloquea la purga legal (best-effort)', async () => {
    const deleteEmbeddings = vi.fn().mockResolvedValue(0);
    const logStateChange = vi.fn().mockRejectedValue(new Error('log down'));
    await handleSemanticConsentChange(
      changeEvent(UID, { enabled: true, acknowledgedAt: 1 }, { enabled: false, acknowledgedAt: 1 }),
      { deleteEmbeddings, logStateChange },
    );
    // El log falló pero la purga corrió igual (no se propagó el error del log).
    expect(deleteEmbeddings).toHaveBeenCalledWith(UID);
  });
});
