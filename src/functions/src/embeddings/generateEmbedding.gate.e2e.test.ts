import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { generateEmbeddingHandler } from './generateEmbedding';
import { readSemanticConsent } from '../lib/readSemanticConsent';

// SPEC-66 F2 — test del INVARIANTE legal de §7.1 por el camino server-side, que
// es lo que hace verdad al ToS: "la búsqueda semántica NO transmite texto a
// OpenAI hasta un reconocimiento afirmativo". Invoca el handler del trigger
// DIRECTO (como deleteAccount.gate.e2e) con un evento fabricado, contra el
// Firestore emulator (FIRESTORE_EMULATOR_HOST lo inyecta `firebase emulators:exec`).
// El gate (readSemanticConsent) lee el doc REAL del emulador; el creador de
// embedding se inyecta como SPY → verificamos "cero embedding, cero llamada a
// OpenAI" SIN tocar la API. (vi.mock NO cruza al proceso forkeado del emulador;
// por eso la DI por argumento, que corre en este mismo proceso de test.)

const UID = 'semantic-gate-uid';
const NOTE_ID = 'note-1';

function fakeEvent(userId: string, noteId: string, contentPlain: string) {
  return {
    params: { userId, noteId },
    data: { after: { data: () => ({ contentPlain }) } },
  };
}

describe('generateEmbedding — gate del invariante (SPEC-66 F2)', () => {
  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: 'demo-secondmind' });
  });

  beforeEach(async () => {
    const db = getFirestore();
    await db.recursiveDelete(db.doc(`users/${UID}`));
    // El ack-proof vive fuera de users/{uid} (top-level deny-all) → limpiarlo aparte.
    await db.recursiveDelete(db.doc(`consentLog/${UID}`));
  });

  it('consentimiento AUSENTE → CERO embedding, CERO llamada a OpenAI', async () => {
    const db = getFirestore();
    // No seedeamos users/{uid}/settings/semanticSearch → doc ausente = inerte.
    const embed = vi.fn().mockResolvedValue(undefined);

    await generateEmbeddingHandler(fakeEvent(UID, NOTE_ID, 'texto sensible de la nota'), {
      readConsent: readSemanticConsent,
      embed,
    });

    // (1) El creador de embedding NUNCA se invocó → no hubo egreso a OpenAI.
    expect(embed).not.toHaveBeenCalled();
    // (2) No se creó el doc de embedding.
    const snap = await db.doc(`users/${UID}/embeddings/${NOTE_ID}`).get();
    expect(snap.exists).toBe(false);
  });

  it('enabled:true (doc vivo) SIN ack-proof en consentLog → CERO embedding (el gate exige reconocimiento registrado)', async () => {
    const db = getFirestore();
    // enabled forjado en el doc vivo, pero SIN doc resumen → el gate niega igual.
    await db.doc(`users/${UID}/settings/semanticSearch`).set({ enabled: true });
    const embed = vi.fn().mockResolvedValue(undefined);

    await generateEmbeddingHandler(fakeEvent(UID, NOTE_ID, 'texto'), {
      readConsent: readSemanticConsent,
      embed,
    });

    expect(embed).not.toHaveBeenCalled();
  });

  it('control: enabled (doc vivo) + acknowledgedAt en consentLog → SÍ genera (embed con el contenido)', async () => {
    const db = getFirestore();
    // enabled en el doc vivo; el ack-proof SOLO en el doc resumen deny-all (prueba
    // que el gate lo lee de ahí, no del doc vivo — revertir el gate rompe este test).
    await db.doc(`users/${UID}/settings/semanticSearch`).set({ enabled: true });
    await db.doc(`consentLog/${UID}`).set({ acknowledgedAt: Date.now() });
    const embed = vi.fn().mockResolvedValue(undefined);

    await generateEmbeddingHandler(fakeEvent(UID, NOTE_ID, 'texto de la nota'), {
      readConsent: readSemanticConsent,
      embed,
    });

    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith(UID, NOTE_ID, 'texto de la nota');
  });
});
