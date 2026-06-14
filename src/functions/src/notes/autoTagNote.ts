import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { buildNoteSchema, isValidNoteType, NoteTagging } from '../lib/schemas';
import { sanitizeError } from '../lib/sanitizeError';
import { getUserAnthropicKey, invalidateUserAnthropicKey } from '../lib/getUserAnthropicKey';
import { getUserLocale } from '../lib/getUserLocale';
import { buildNoteSystemPrompt, buildNoteToolDescription, buildNoteUserPrompt } from './prompts';

const byokMasterKey = defineSecret('BYOK_MASTER_KEY');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 256;
const MAX_CONTENT_CHARS = 10_000;

export const autoTagNote = onDocumentWritten(
  {
    document: 'users/{userId}/notes/{noteId}',
    secrets: [byokMasterKey],
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

    if (contentPlain.length > MAX_CONTENT_CHARS) {
      logger.warn('autoTagNote: contentPlain too long, skip', {
        userId,
        noteId,
        length: contentPlain.length,
      });
      return;
    }

    const docRef = admin.firestore().doc(`users/${userId}/notes/${noteId}`);

    try {
      const key = await getUserAnthropicKey(userId, byokMasterKey.value());
      if (!key) {
        logger.info('autoTagNote: skip, sin BYOK key', { userId, noteId });
        return;
      }
      const locale = await getUserLocale(userId);
      const client = new Anthropic({ apiKey: key });

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: 'text',
            text: buildNoteSystemPrompt(locale),
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [
          {
            name: 'tag_note',
            description: buildNoteToolDescription(locale),
            input_schema: buildNoteSchema(locale),
          },
        ],
        tool_choice: { type: 'tool', name: 'tag_note' },
        messages: [
          {
            role: 'user',
            content: buildNoteUserPrompt(locale, contentPlain),
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

      // Guard post-LLM (F3.1): suggestedNoteType es un ID de identidad; si el modelo
      // lo devolvió traducido/inválido (riesgo del prompt en), descartamos la
      // sugerencia y dejamos el estado manejado (aiProcessed:true vacío) — idéntico
      // al path "no tool_use"; onDocumentWritten re-dispara, necesita el flag.
      if (!isValidNoteType(result.suggestedNoteType)) {
        logger.warn('autoTagNote: suggestedNoteType invalido, descarta sugerencia', {
          userId,
          noteId,
          suggestedNoteType: result.suggestedNoteType,
        });
        await docRef.update({ aiProcessed: true, aiTags: '[]', aiSummary: '' });
        return;
      }

      const confidence = Math.min(1, Math.max(0, result.noteTypeConfidence ?? 0));

      await docRef.update({
        aiTags: JSON.stringify(result.tags),
        aiSummary: result.summary,
        aiProcessed: true,
        suggestedNoteType: result.suggestedNoteType,
        noteTypeConfidence: confidence,
      });

      logger.info('autoTagNote: ok', {
        userId,
        noteId,
        tagCount: result.tags.length,
        suggestedNoteType: result.suggestedNoteType,
        noteTypeConfidence: confidence,
      });
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (status === 401 || status === 403) {
        // D9 (G2): key revocada/inválida en uso → invalidar para cortar
        // reintentos (autoTagNote se dispara en cada edición) y reflejarlo en UI.
        await invalidateUserAnthropicKey(userId);
      }
      const { code, message } = sanitizeError(error);
      logger.error('autoTagNote: failed', { userId, noteId, code, message });
    }
  },
);
