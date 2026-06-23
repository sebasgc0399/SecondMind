import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { requireVerified } from '../lib/requireVerified';
import { assertAllowlisted } from '../lib/assertAllowlisted';
import { assertSemanticConsent } from '../lib/readSemanticConsent';
import { sanitizeError } from '../lib/sanitizeError';
import { createNoteEmbedding } from './generateEmbedding';

const openaiApiKey = defineSecret('OPENAI_API_KEY');

// Notas por invocación. Cada una con contenido nuevo = 1 llamada a OpenAI
// (~100-300ms) → una página chica acota el timeout. El cliente re-llama con el
// cursor hasta done. Idempotente: createNoteEmbedding saltea lo ya embebido por
// contentHash, así que re-correr una página es gratis.
const PAGE_SIZE = 20;

interface BackfillRequest {
  cursor?: string;
}

interface BackfillResponse {
  processed: number;
  skipped: number;
  done: boolean;
  cursor: string | null;
}

// Dependencia inyectable para test: el creador de embedding (en prod, el real;
// el test pasa un spy para verificar paginación/conteo sin llamar a OpenAI).
export interface BackfillDeps {
  embed: typeof createNoteEmbedding;
}

const defaultDeps: BackfillDeps = { embed: createNoteEmbedding };

// SPEC-66 F6 — backfill de embeddings de las notas EXISTENTES al habilitar la
// búsqueda semántica (que estuvieron inertes por el invariante). Reusa EXACTAMENTE
// createNoteEmbedding (la misma generación + idempotencia por contentHash que el
// trigger A1) — UNA sola fuente de verdad para crear embeddings, sin caminos que
// puedan divergir. Solo corre POST-consentimiento: re-verifica el flag server-side
// (assertSemanticConsent) al inicio de CADA página; si el usuario desactiva
// mid-backfill, la próxima página es rechazada (y el trigger F7 ya purgó).
export async function backfillEmbeddingsHandler(
  request: CallableRequest<BackfillRequest>,
  deps: BackfillDeps = defaultDeps,
): Promise<BackfillResponse> {
  const userId = requireVerified(request);
  await assertAllowlisted(request.auth?.token.email);
  await assertSemanticConsent(userId);

  const cursor = typeof request.data?.cursor === 'string' ? request.data.cursor : undefined;
  const db = getFirestore();

  let q = db.collection(`users/${userId}/notes`).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  if (cursor) q = q.startAfter(cursor);
  const snap = await q.get();

  let processed = 0;
  let skipped = 0;
  let lastId: string | null = null;

  for (const doc of snap.docs) {
    lastId = doc.id;
    const data = doc.data();
    const contentPlain = typeof data?.contentPlain === 'string' ? data.contentPlain.trim() : '';
    if (!contentPlain) {
      skipped += 1;
      continue;
    }
    try {
      const result = await deps.embed(userId, doc.id, contentPlain);
      if (result === 'created') processed += 1;
      else skipped += 1;
    } catch (error) {
      // Una nota que falla no aborta la página: el re-run idempotente la retoma.
      const { code, message } = sanitizeError(error);
      logger.error('backfillEmbeddings: note failed', { userId, noteId: doc.id, code, message });
    }
  }

  const done = snap.size < PAGE_SIZE;
  logger.info('backfillEmbeddings: page', { userId, processed, skipped, done });
  return { processed, skipped, done, cursor: lastId };
}

export const backfillEmbeddings = onCall<BackfillRequest, Promise<BackfillResponse>>(
  {
    secrets: [openaiApiKey],
    timeoutSeconds: 300,
    region: 'us-central1',
    maxInstances: 3,
  },
  (request) => backfillEmbeddingsHandler(request),
);
