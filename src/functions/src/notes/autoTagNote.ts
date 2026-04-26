import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { NOTE_TAGGING_SCHEMA, NoteTagging } from '../lib/schemas';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 256;

const SYSTEM_PROMPT = `Eres un asistente que analiza notas personales para un sistema Zettelkasten.

Dada una nota, devuelve vía la herramienta tag_note:

1. tags: hasta 5 etiquetas conceptuales bajadas del contenido. No inventes términos ajenos al texto.

2. summary: una oración (máx 120 caracteres) que captura la idea central. Sin floreos.

3. suggestedNoteType + noteTypeConfidence: clasifica el tipo Zettelkasten:
   - "literature": la nota cita o resume una fuente externa (link http, mención explícita de libro/paper/blog, frases tipo "según X dice"). Confianza alta (0.85-1.0) con link explícito; media (0.7-0.85) con mención clara sin link.
   - "permanent": idea atómica original del usuario en sus propias palabras (no es cita), conceptualmente clara, idealmente con interconexiones. Confianza alta cuando hay claridad conceptual y voz del autor.
   - "fleeting": captura cruda, fragmentaria o sin estructura clara. Default conservador. Confianza baja-media (0.5-0.7).

Si dudas, prefiere fleeting con confianza baja antes que forzar otra categoría.`;

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
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [
          {
            name: 'tag_note',
            description: 'Sugiere tags, resumen y tipo Zettelkasten para una nota personal',
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
      const message = error instanceof Error ? error.message : String(error);
      logger.error('autoTagNote: failed', { userId, noteId, error: message });
    }
  },
);
