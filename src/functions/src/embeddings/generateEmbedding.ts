import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import OpenAI from 'openai';

const openaiApiKey = defineSecret('OPENAI_API_KEY');

const MODEL = 'text-embedding-3-small';

export const generateEmbedding = onDocumentWritten(
  {
    document: 'users/{userId}/notes/{noteId}',
    secrets: [openaiApiKey],
    timeoutSeconds: 60,
    retry: false,
    region: 'us-central1',
  },
  async (event) => {
    const { userId, noteId } = event.params;
    const after = event.data?.after?.data();

    if (!after) return;

    const contentPlain = typeof after.contentPlain === 'string' ? after.contentPlain.trim() : '';
    if (!contentPlain) return;

    const contentHash = crypto.createHash('sha256').update(contentPlain).digest('hex');

    const embeddingRef = admin.firestore().doc(`users/${userId}/embeddings/${noteId}`);

    const existingDoc = await embeddingRef.get();
    if (existingDoc.exists && existingDoc.data()?.contentHash === contentHash) {
      return;
    }

    try {
      const client = new OpenAI({ apiKey: openaiApiKey.value() });

      const response = await client.embeddings.create({
        model: MODEL,
        input: contentPlain,
      });

      const vector = response.data[0].embedding;

      await embeddingRef.set({
        id: noteId,
        vector,
        model: MODEL,
        contentHash,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info('generateEmbedding: ok', {
        userId,
        noteId,
        dimensions: vector.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('generateEmbedding: failed', {
        userId,
        noteId,
        error: message,
      });
    }
  },
);
