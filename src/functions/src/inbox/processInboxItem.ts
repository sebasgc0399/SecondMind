import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { INBOX_CLASSIFICATION_SCHEMA, InboxClassification } from '../lib/schemas';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;

const SYSTEM_PROMPT = `Eres un asistente de productividad personal. Analizas capturas rapidas del usuario y sugieres como clasificarlas. El usuario tiene estas areas: Proyectos, Conocimiento, Finanzas, Salud y Ejercicio, Pareja, Habitos.`;

export const processInboxItem = onDocumentCreated(
  {
    document: 'users/{userId}/inbox/{itemId}',
    secrets: [anthropicApiKey],
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

    const docRef = admin.firestore().doc(`users/${userId}/inbox/${itemId}`);

    try {
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: 'classify_inbox',
            description: 'Clasifica una captura de inbox del usuario',
            input_schema: INBOX_CLASSIFICATION_SCHEMA,
          },
        ],
        tool_choice: { type: 'tool', name: 'classify_inbox' },
        messages: [
          {
            role: 'user',
            content: `Clasifica esta captura:\n"${rawContent}"`,
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

      await docRef.update({
        aiSuggestedTitle: result.suggestedTitle,
        aiSuggestedType: result.suggestedType,
        aiSuggestedTags: JSON.stringify(result.suggestedTags),
        aiSuggestedArea: result.suggestedArea,
        aiSummary: result.summary,
        aiPriority: result.priority,
        aiProcessed: true,
      });

      logger.info('processInboxItem: ok', {
        userId,
        itemId,
        suggestedType: result.suggestedType,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('processInboxItem: failed', {
        userId,
        itemId,
        error: message,
      });
    }
  },
);
