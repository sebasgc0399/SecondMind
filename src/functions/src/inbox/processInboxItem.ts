import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { buildInboxSchema, checkInboxEnums, InboxClassification } from '../lib/schemas';
import { sanitizeError } from '../lib/sanitizeError';
import { getUserAnthropicKey, invalidateUserAnthropicKey } from '../lib/getUserAnthropicKey';
import { getUserLocale } from '../lib/getUserLocale';
import { buildInboxSystemPrompt, buildInboxToolDescription, buildInboxUserPrompt } from './prompts';

const byokMasterKey = defineSecret('BYOK_MASTER_KEY');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;
const MAX_CONTENT_CHARS = 10_000;

export const processInboxItem = onDocumentCreated(
  {
    document: 'users/{userId}/inbox/{itemId}',
    secrets: [byokMasterKey],
    timeoutSeconds: 60,
    retry: false,
    region: 'us-central1',
  },
  async (event) => {
    const { userId, itemId } = event.params;
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn('processInboxItem: snapshot ausente', { userId, itemId });
      return;
    }

    const data = snapshot.data();
    const rawContent = typeof data.rawContent === 'string' ? data.rawContent.trim() : '';

    if (!rawContent) {
      logger.warn('processInboxItem: rawContent vacio, skip', {
        userId,
        itemId,
      });
      return;
    }

    if (rawContent.length > MAX_CONTENT_CHARS) {
      logger.warn('processInboxItem: rawContent too long, skip', {
        userId,
        itemId,
        length: rawContent.length,
      });
      return;
    }

    const docRef = admin.firestore().doc(`users/${userId}/inbox/${itemId}`);

    try {
      const key = await getUserAnthropicKey(userId, byokMasterKey.value());
      if (!key) {
        logger.info('processInboxItem: skip, sin BYOK key', { userId, itemId });
        return;
      }
      const locale = await getUserLocale(userId);
      const client = new Anthropic({ apiKey: key });

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildInboxSystemPrompt(locale),
        tools: [
          {
            name: 'classify_inbox',
            description: buildInboxToolDescription(locale),
            input_schema: buildInboxSchema(locale),
          },
        ],
        tool_choice: { type: 'tool', name: 'classify_inbox' },
        messages: [
          {
            role: 'user',
            content: buildInboxUserPrompt(locale, rawContent),
          },
        ],
      });

      const toolBlock = response.content.find((b) => b.type === 'tool_use');
      if (!toolBlock || toolBlock.type !== 'tool_use') {
        logger.error('processInboxItem: no tool_use block en respuesta', {
          userId,
          itemId,
        });
        return;
      }

      const result = toolBlock.input as InboxClassification;

      // Guard post-LLM (F3.1): si el modelo devolvió un enum de identidad fuera del
      // set canónico (p.ej. traducido por el prompt en), descartamos toda la
      // sugerencia — no persistimos un valor roto que rompería el matching D5 del
      // cliente. Mismo efecto que el path "no tool_use" (onDocumentCreated dispara
      // una vez → no hace falta marcar aiProcessed).
      const enums = checkInboxEnums(result);
      if (enums.discard) {
        logger.warn('processInboxItem: enum de identidad invalido, descarta sugerencia', {
          userId,
          itemId,
          suggestedType: result.suggestedType,
          suggestedArea: result.suggestedArea,
        });
        return;
      }

      await docRef.update({
        aiSuggestedTitle: result.suggestedTitle,
        aiSuggestedType: result.suggestedType,
        aiSuggestedTags: JSON.stringify(result.suggestedTags),
        aiSuggestedArea: result.suggestedArea,
        aiSummary: result.summary,
        aiPriority: enums.priority,
        aiConfidence: typeof result.confidence === 'number' ? result.confidence : 0,
        aiProcessed: true,
      });

      logger.info('processInboxItem: ok', {
        userId,
        itemId,
        suggestedType: result.suggestedType,
      });
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (status === 401 || status === 403) {
        // D9 (G2): key revocada/inválida en uso → invalidar para cortar
        // reintentos y reflejarlo en la UI (settings/aiKeys).
        await invalidateUserAnthropicKey(userId);
      }
      const { code, message } = sanitizeError(error);
      logger.error('processInboxItem: failed', {
        userId,
        itemId,
        code,
        message,
      });
    }
  },
);
