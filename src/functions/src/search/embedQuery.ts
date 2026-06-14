import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import OpenAI from 'openai';
import { requireVerified } from '../lib/requireVerified';
import { assertAllowlisted } from '../lib/assertAllowlisted';
import { enforceRateLimit } from '../lib/rateLimit';
import { sanitizeError } from '../lib/sanitizeError';
import { appError } from '../lib/appError';

const openaiApiKey = defineSecret('OPENAI_API_KEY');

const MODEL = 'text-embedding-3-small';
// SPEC-51 F6: es una QUERY de búsqueda, no contenido → 300 chars alcanzan y acotan el
// costo por llamada (OpenAI cobra por token).
const MAX_TEXT_LENGTH = 300;
// SPEC-51 F8: cap anti-abuso por usuario (tunable). Con el debounce de 500ms del
// cliente el techo legítimo es bajo; estos cortan el abuso sin tocar el uso normal.
const RATE_LIMITS = { perMinute: 60, perDay: 1000 };

interface EmbedQueryRequest {
  text: string;
}

interface EmbedQueryResponse {
  vector: number[];
}

export const embedQuery = onCall<EmbedQueryRequest, Promise<EmbedQueryResponse>>(
  {
    secrets: [openaiApiKey],
    timeoutSeconds: 10,
    region: 'us-central1',
    // A-4 (F2): cap de instancias concurrentes. embedQuery usa la OPENAI_API_KEY
    // COMPARTIDA del operador (no BYOK) → bounded-cost ante abuso. Complementa el
    // rate-limit por-uid de F8: maxInstances acota la concurrencia, el rate-limit el total.
    maxInstances: 5,
  },
  async (request) => {
    const userId = requireVerified(request);
    // SPEC-51 F6 (A-3): cierra el hueco — un usuario verificado pero NO allowlisted ya
    // no puede gastar la OpenAI compartida por endpoint directo. Va ANTES del try de
    // OpenAI (no dentro, o el HttpsError 'permission-denied' se degradaría a 'internal').
    await assertAllowlisted(request.auth?.token.email);

    const rawText = request.data?.text;

    if (rawText === null || rawText === undefined || typeof rawText !== 'string') {
      throw appError(
        'embed-query-invalid-text',
        'invalid-argument',
        'text is required and must be a string',
      );
    }

    const text = rawText.trim();

    if (!text) {
      throw appError('embed-query-empty-text', 'invalid-argument', 'text cannot be empty');
    }

    if (text.length > MAX_TEXT_LENGTH) {
      throw appError(
        'embed-query-text-too-long',
        'invalid-argument',
        `text exceeds ${MAX_TEXT_LENGTH} characters`,
      );
    }

    // SPEC-51 F8 (A-3): rate-limit por-uid tras validar el input (los malformados no
    // consumen cuota) y antes del recurso caro. Lanza 'resource-exhausted' al superar;
    // el cliente degrada a keyword-only (useHybridSearch). También antes del try.
    await enforceRateLimit(userId, 'embedQuery', RATE_LIMITS);

    try {
      const client = new OpenAI({ apiKey: openaiApiKey.value() });

      const response = await client.embeddings.create({
        model: MODEL,
        input: text,
      });

      const vector = response.data[0].embedding;

      logger.info('embedQuery: ok', {
        userId,
        dimensions: vector.length,
        chars: text.length,
      });

      return { vector };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      logger.error('embedQuery: failed', { userId, code, message });
      throw appError('embed-query-failed', 'internal', 'Failed to generate embedding');
    }
  },
);
