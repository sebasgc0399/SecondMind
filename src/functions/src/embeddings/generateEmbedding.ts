import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import OpenAI from 'openai';
import { sanitizeError } from '../lib/sanitizeError';
import { isSemanticConsentGranted, readSemanticConsent } from '../lib/readSemanticConsent';

const openaiApiKey = defineSecret('OPENAI_API_KEY');

const MODEL = 'text-embedding-3-small';

// SPEC-66 F6 — generación + escritura del embedding de UNA nota, factorizada
// para que el backfill (al habilitar la búsqueda semántica) reuse exactamente
// la misma lógica e idempotencia por `contentHash` que el trigger. Lee la
// OPENAI_API_KEY del secret en runtime (nunca top-level).
export async function createNoteEmbedding(
  userId: string,
  noteId: string,
  contentPlain: string,
): Promise<'created' | 'skipped'> {
  const contentHash = crypto.createHash('sha256').update(contentPlain).digest('hex');
  const embeddingRef = admin.firestore().doc(`users/${userId}/embeddings/${noteId}`);
  const existingDoc = await embeddingRef.get();

  // Idempotente: si el contenido no cambió, no se re-genera (ni se re-paga OpenAI).
  // El backfill (F6) usa este retorno para contar; el trigger lo ignora.
  if (existingDoc.exists && existingDoc.data()?.contentHash === contentHash) {
    return 'skipped';
  }

  const client = new OpenAI({ apiKey: openaiApiKey.value() });
  const response = await client.embeddings.create({ model: MODEL, input: contentPlain });
  const vector = response.data[0].embedding;

  await embeddingRef.set({
    id: noteId,
    vector,
    model: MODEL,
    contentHash,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info('generateEmbedding: ok', { userId, noteId, dimensions: vector.length });

  return 'created';
}

// Dependencias inyectables para test: el gate (readConsent) y el creador de
// embedding (embed). En prod usan las reales; el e2e pasa un spy para verificar
// el invariante sin llamar a OpenAI (vi.mock no cruza al proceso del emulador,
// por eso la DI por argumento — el handler corre en el proceso del test).
export interface GenerateEmbeddingDeps {
  readConsent: typeof readSemanticConsent;
  embed: typeof createNoteEmbedding;
}

const defaultDeps: GenerateEmbeddingDeps = {
  readConsent: readSemanticConsent,
  embed: createNoteEmbedding,
};

// Estructura mínima del evento que usa el handler (params + after.data()).
// `onDocumentWritten` pasa un FirestoreEvent estructuralmente compatible; el
// test e2e fabrica este shape.
interface NoteWrittenEvent {
  params: { userId: string; noteId: string };
  data?: { after?: { data: () => Record<string, unknown> | undefined } };
}

export async function generateEmbeddingHandler(
  event: NoteWrittenEvent,
  deps: GenerateEmbeddingDeps = defaultDeps,
): Promise<void> {
  const { userId, noteId } = event.params;
  const after = event.data?.after?.data();

  if (!after) return;

  // SPEC-66 F2 — GATE DEL INVARIANTE (§7.1). Va al TOPE del handler, antes de
  // cualquier I/O sobre embeddings: sin reconocimiento afirmativo registrado,
  // CERO actividad (ni se toca el embedding stale, ni hay egreso a OpenAI).
  // Server-side y autoritativo: re-lee el doc de consentimiento con Admin SDK,
  // nunca confía en la UI ni en lo que el cliente escribió (las rules dejan al
  // owner escribir su propio flag → por eso re-verificamos acá).
  const consent = await deps.readConsent(userId);
  if (!isSemanticConsentGranted(consent)) {
    return;
  }

  const contentPlain = typeof after.contentPlain === 'string' ? after.contentPlain.trim() : '';

  if (!contentPlain) {
    const embeddingRef = admin.firestore().doc(`users/${userId}/embeddings/${noteId}`);
    const existingDoc = await embeddingRef.get();
    if (existingDoc.exists) {
      await embeddingRef.delete().catch((err) => {
        const { code, message } = sanitizeError(err);
        logger.warn('generateEmbedding: delete stale embedding failed', {
          userId,
          noteId,
          code,
          message,
        });
      });
      logger.info('generateEmbedding: empty content, deleted stale embedding', { userId, noteId });
    }
    return;
  }

  try {
    await deps.embed(userId, noteId, contentPlain);
  } catch (error) {
    const { code, message } = sanitizeError(error);
    logger.error('generateEmbedding: failed', { userId, noteId, code, message });
  }
}

export const generateEmbedding = onDocumentWritten(
  {
    document: 'users/{userId}/notes/{noteId}',
    secrets: [openaiApiKey],
    timeoutSeconds: 60,
    retry: false,
    region: 'us-central1',
  },
  (event) => generateEmbeddingHandler(event),
);
