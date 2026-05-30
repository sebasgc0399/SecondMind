import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import OpenAI from 'openai';
import { requireVerified } from '../lib/requireVerified';
import { sanitizeError } from '../lib/sanitizeError';

const openaiApiKey = defineSecret('OPENAI_API_KEY');

const MODEL = 'text-embedding-3-small';
const MAX_TEXT_LENGTH = 500;

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
  },
  async (request) => {
    const userId = requireVerified(request);
    const rawText = request.data?.text;

    if (rawText === null || rawText === undefined || typeof rawText !== 'string') {
      throw new HttpsError('invalid-argument', 'text is required and must be a string');
    }

    const text = rawText.trim();

    if (!text) {
      throw new HttpsError('invalid-argument', 'text cannot be empty');
    }

    if (text.length > MAX_TEXT_LENGTH) {
      throw new HttpsError('invalid-argument', `text exceeds ${MAX_TEXT_LENGTH} characters`);
    }

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
      throw new HttpsError('internal', 'Failed to generate embedding');
    }
  },
);
