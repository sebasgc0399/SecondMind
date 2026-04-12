import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { stripJsonFence } from '../lib/parseJson';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 256;

const SYSTEM_PROMPT = `Eres un asistente que analiza notas personales y sugiere tags relevantes. Maximo 5 tags. También genera un resumen de una linea.`;

function buildUserPrompt(contentPlain: string): string {
  return `Nota:
"${contentPlain}"

Responde SOLO con JSON valido, sin markdown:
{
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "Resumen de una linea"
}`;
}

interface TagResult {
  tags: string[];
  summary: string;
}

function parseTagResult(text: string): TagResult {
  const cleaned = stripJsonFence(text);
  const parsed: unknown = JSON.parse(cleaned);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Respuesta de Claude no es un objeto JSON');
  }

  const obj = parsed as Record<string, unknown>;

  const rawTags = obj.tags;
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === 'string').slice(0, 5)
    : [];

  const summary = typeof obj.summary === 'string' ? obj.summary : '';

  return { tags, summary };
}

export const autoTagNote = onDocumentWritten(
  {
    document: 'users/{userId}/notes/{noteId}',
    secrets: [anthropicApiKey],
    timeoutSeconds: 60,
    retry: false,
    region: 'us-central1',
  },
  async (event) => {
    const { userId, noteId } = event.params;
    const after = event.data?.after?.data();
    if (!after) return; // doc borrado

    if (after.aiProcessed) return; // ya procesada — early return sin log (frecuente)

    const contentPlain = typeof after.contentPlain === 'string' ? after.contentPlain.trim() : '';
    if (!contentPlain) return; // sin contenido — early return sin log (frecuente)

    const docRef = admin.firestore().doc(`users/${userId}/notes/${noteId}`);

    try {
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(contentPlain) }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Respuesta de Claude sin bloque de texto');
      }

      const result = parseTagResult(textBlock.text);

      await docRef.update({
        aiTags: JSON.stringify(result.tags),
        aiSummary: result.summary,
        aiProcessed: true,
      });

      logger.info('autoTagNote: ok', {
        userId,
        noteId,
        tagCount: result.tags.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('autoTagNote: failed', { userId, noteId, error: message });
    }
  },
);
