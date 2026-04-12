import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { stripJsonFence } from '../lib/parseJson';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;

const VALID_TYPES = ['note', 'task', 'project', 'trash'] as const;
const VALID_AREAS = [
  'proyectos',
  'conocimiento',
  'finanzas',
  'salud',
  'pareja',
  'habitos',
] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

type SuggestedType = (typeof VALID_TYPES)[number];
type SuggestedArea = (typeof VALID_AREAS)[number];
type SuggestedPriority = (typeof VALID_PRIORITIES)[number];

interface AiSuggestion {
  suggestedTitle: string;
  suggestedType: SuggestedType;
  suggestedTags: string[];
  suggestedArea: SuggestedArea;
  summary: string;
  priority: SuggestedPriority;
}

const SYSTEM_PROMPT = `Eres un asistente de productividad personal. Analizas capturas rápidas del usuario y sugieres cómo clasificarlas. El usuario tiene estas áreas: Proyectos, Conocimiento, Finanzas, Salud y Ejercicio, Pareja, Hábitos.`;

function buildUserPrompt(rawContent: string): string {
  return `Clasifica esta captura:
"${rawContent}"

Responde SOLO con JSON válido, sin markdown:
{
  "suggestedTitle": "Título conciso (max 80 chars)",
  "suggestedType": "note" | "task" | "project" | "trash",
  "suggestedTags": ["tag1", "tag2"],
  "suggestedArea": "proyectos" | "conocimiento" | "finanzas" | "salud" | "pareja" | "habitos",
  "summary": "Resumen de una línea",
  "priority": "low" | "medium" | "high" | "urgent"
}`;
}

function parseSuggestion(text: string): AiSuggestion {
  const cleaned = stripJsonFence(text);
  const parsed: unknown = JSON.parse(cleaned);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Respuesta de Claude no es un objeto JSON');
  }

  const obj = parsed as Record<string, unknown>;

  const suggestedTitle = obj.suggestedTitle;
  if (typeof suggestedTitle !== 'string' || suggestedTitle.trim().length === 0) {
    throw new Error('suggestedTitle inválido o vacío');
  }

  const suggestedType = obj.suggestedType;
  if (typeof suggestedType !== 'string' || !VALID_TYPES.includes(suggestedType as SuggestedType)) {
    throw new Error(`suggestedType inválido: ${String(suggestedType)}`);
  }

  const rawTags = obj.suggestedTags;
  const suggestedTags: string[] = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === 'string').slice(0, 10)
    : [];

  const rawArea = obj.suggestedArea;
  const validatedArea: SuggestedArea =
    typeof rawArea === 'string' && VALID_AREAS.includes(rawArea as SuggestedArea)
      ? (rawArea as SuggestedArea)
      : 'conocimiento';

  const summary = typeof obj.summary === 'string' ? obj.summary : '';

  const priority = obj.priority;
  const validatedPriority: SuggestedPriority =
    typeof priority === 'string' && VALID_PRIORITIES.includes(priority as SuggestedPriority)
      ? (priority as SuggestedPriority)
      : 'medium';

  return {
    suggestedTitle: suggestedTitle.slice(0, 200),
    suggestedType: suggestedType as SuggestedType,
    suggestedTags,
    suggestedArea: validatedArea,
    summary,
    priority: validatedPriority,
  };
}

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
      logger.warn('processInboxItem: rawContent vacío, skip', { userId, itemId });
      return;
    }

    const docRef = admin.firestore().doc(`users/${userId}/inbox/${itemId}`);

    try {
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(rawContent) }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Respuesta de Claude sin bloque de texto');
      }

      const suggestion = parseSuggestion(textBlock.text);

      await docRef.update({
        aiSuggestedTitle: suggestion.suggestedTitle,
        aiSuggestedType: suggestion.suggestedType,
        aiSuggestedTags: JSON.stringify(suggestion.suggestedTags),
        aiSuggestedArea: suggestion.suggestedArea,
        aiSummary: suggestion.summary,
        aiPriority: suggestion.priority,
        aiProcessed: true,
      });

      logger.info('processInboxItem: ok', {
        userId,
        itemId,
        suggestedType: suggestion.suggestedType,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('processInboxItem: failed', { userId, itemId, error: message });
    }
  },
);
