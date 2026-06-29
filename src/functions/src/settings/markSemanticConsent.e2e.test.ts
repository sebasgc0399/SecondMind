import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { markSemanticConsentHandler } from './markSemanticConsent';
import { readSemanticConsent, isSemanticConsentGranted } from '../lib/readSemanticConsent';

// SPEC consent server-authoritative — prueba el WRITE PATH del reconocimiento
// (markSemanticConsent) contra el Firestore emulator, invocando el handler con una
// request fabricada (como backfill.gate.e2e). Cubre el agujero que dejó el gate
// e2e: ahí el ack-proof se SEEDEA directo; acá se MINTEA por el callable real, así
// validamos los 3 writes atómicos + que el serverTimestamp resuelve en el runtime
// real (el bug FieldValue.serverTimestamp undefined que rompía el trigger habría
// roto acá TODO el batch.commit) + que el gate concede inmediatamente después.

const UID = 'markconsent-uid';
const EMAIL = `${UID}@x.test`;

function fakeRequest(data: { locale?: unknown; appVersion?: unknown }): CallableRequest {
  return {
    auth: { uid: UID, token: { email: EMAIL, email_verified: true } },
    data,
  } as unknown as CallableRequest;
}

describe('markSemanticConsentHandler (consent server-authoritative)', () => {
  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: 'demo-secondmind' });
  });

  beforeEach(async () => {
    const db = getFirestore();
    await db.recursiveDelete(db.doc(`users/${UID}`));
    await db.recursiveDelete(db.doc(`consentLog/${UID}`));
    await db.collection('allowlist').doc(EMAIL).delete();
  });

  it('escribe los 3 docs atómicos (vivo + resumen + evento) y el gate concede después', async () => {
    const db = getFirestore();
    await db.collection('allowlist').doc(EMAIL).set({});

    const res = await markSemanticConsentHandler(
      fakeRequest({ locale: 'es', appVersion: '0.5.4' }),
    );
    expect(res.ok).toBe(true);
    expect(typeof res.acknowledgedAt).toBe('number');

    // (a) Doc vivo: enabled + acknowledgedAt NUMBER (no Timestamp).
    const live = (await db.doc(`users/${UID}/settings/semanticSearch`).get()).data();
    expect(live?.enabled).toBe(true);
    expect(typeof live?.acknowledgedAt).toBe('number');

    // (b) Doc resumen deny-all: ack-proof number + metadata + serverTimestamp RESUELTO.
    const summary = (await db.doc(`consentLog/${UID}`).get()).data();
    expect(typeof summary?.acknowledgedAt).toBe('number');
    expect(summary?.noticeVersion).toBe(2);
    expect(summary?.scope).toContain('semantic-search-activation');
    expect(summary?.mechanism).toBe('affirmative-acknowledgment-first-use');
    expect(summary?.updatedAt).toBeDefined(); // serverTimestamp resolvió (no tiró undefined)

    // (c) Evento append-only de evidencia.
    const events = await db.collection(`consentLog/${UID}/events`).get();
    expect(events.size).toBe(1);
    const ev = events.docs[0]!.data();
    expect(ev.action).toBe('acknowledged');
    expect(ev.locale).toBe('es');
    expect(ev.appVersion).toBe('0.5.4');
    expect(ev.recordedAt).toBeDefined();

    // Integración: el gate de egreso ahora concede (lee el ack-proof del resumen).
    const consent = await readSemanticConsent(UID);
    expect(isSemanticConsentGranted(consent)).toBe(true);
  });

  it('appVersion ausente → se persiste null (campo opcional)', async () => {
    const db = getFirestore();
    await db.collection('allowlist').doc(EMAIL).set({});
    await markSemanticConsentHandler(fakeRequest({ locale: 'en' }));
    const ev = (await db.collection(`consentLog/${UID}/events`).get()).docs[0]!.data();
    expect(ev.appVersion).toBe(null);
  });

  it('locale inválido → invalid-argument (no escribe nada)', async () => {
    const db = getFirestore();
    await db.collection('allowlist').doc(EMAIL).set({});
    await expect(markSemanticConsentHandler(fakeRequest({ locale: '' }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    // No se minteó el ack-proof → el gate sigue inerte.
    const consent = await readSemanticConsent(UID);
    expect(isSemanticConsentGranted(consent)).toBe(false);
  });

  it('no allowlisted → permission-denied (gate cerrado de la beta, antes de escribir)', async () => {
    // Sin seed de allowlist.
    await expect(markSemanticConsentHandler(fakeRequest({ locale: 'es' }))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
