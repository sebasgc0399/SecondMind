import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { NOTE_TAGGING_SCHEMA, NoteTagging } from '../lib/schemas';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 256;

const SYSTEM_PROMPT = `Eres un asistente que analiza notas personales y sugiere tags relevantes. Maximo 5 tags. Tambien genera un resumen de una linea.`;

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
    if (!after) return;

    if (after.aiProcessed) return;

    const contentPlain = typeof after.contentPlain === 'string' ? after.contentPlain.trim() : '';
    if (!contentPlain) return;

    const docRef = admin.firestore().doc(`users/${userId}/notes/${noteId}`);

    try {
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: 'tag_note',
            description: 'Sugiere tags y resumen para una nota personal',
            input_schema: NOTE_TAGGING_SCHEMA,
          },
        ],
        tool_choice: { type: 'tool', name: 'tag_note' },
        messages: [
          {
            role: 'user',
            content: `Analiza esta nota:\n"${contentPlain}"`,
          },
        ],
      });

      const toolBlock = response.content.find((b) => b.type === 'tool_use');
      if (!toolBlock || toolBlock.type !== 'tool_use') {
        logger.error('autoTagNote: no tool_use block en respuesta', {
          userId,
          noteId,
        });
        await docRef.update({ aiProcessed: true, aiTags: '[]', aiSummary: '' });
        return;
      }

      const result = toolBlock.input as NoteTagging;

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
