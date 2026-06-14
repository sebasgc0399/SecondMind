import type { Locale } from './getUserLocale';

// F3.1 (SPEC-58): los schemas de tool-use se construyen por locale para que el
// output de la AI (title/summary/tags) salga en el idioma del usuario. Las
// `description` son lo único que cambia entre locales; el shape y los enums son
// idénticos. Los VALORES de enum son IDs opacos persistidos (D5): NO se localizan.

// --- Enums canónicos (D5) — fuente única consumida por los builders de schema Y
// por los validadores post-LLM (evita drift schema↔guard). NO localizar sus valores.
export const INBOX_TYPES = ['note', 'task', 'project', 'trash'] as const;
export const INBOX_AREAS = [
  'proyectos',
  'conocimiento',
  'finanzas',
  'salud',
  'pareja',
  'habitos',
] as const;
export const INBOX_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const NOTE_TYPES = ['fleeting', 'literature', 'permanent'] as const;

export type InboxType = (typeof INBOX_TYPES)[number];
export type InboxArea = (typeof INBOX_AREAS)[number];
export type InboxPriority = (typeof INBOX_PRIORITIES)[number];
export type SuggestedNoteType = (typeof NOTE_TYPES)[number];

// Descriptions por locale. La rama `es` es BYTE-IDÉNTICA al schema pre-F3.1
// (verificado por schemas.test.ts). La rama `en` agrega, en los campos de enum,
// la instrucción explícita de NO traducir el valor (defensa D5; refuerza el
// SYSTEM_PROMPT en).
const INBOX_DESCRIPTIONS: Record<Locale, Record<keyof InboxClassification, string>> = {
  es: {
    suggestedTitle: 'Titulo conciso para la captura (max 80 caracteres)',
    suggestedType: 'Tipo sugerido de la captura',
    suggestedTags: 'Tags relevantes (max 5)',
    suggestedArea: 'Area de vida a la que pertenece',
    summary: 'Resumen de una linea',
    priority: 'Prioridad sugerida',
    confidence: 'Confianza global de la clasificacion (0 a 1).',
  },
  en: {
    suggestedTitle: 'Concise title for the capture (max 80 characters)',
    suggestedType:
      'Suggested type of the capture. MUST be exactly one of the fixed IDs: note, task, project, trash (do NOT translate these values).',
    suggestedTags: 'Relevant tags (max 5)',
    suggestedArea:
      'Life area it belongs to. MUST be exactly one of the fixed IDs: proyectos, conocimiento, finanzas, salud, pareja, habitos (do NOT translate these values; they are canonical identifiers).',
    summary: 'One-line summary',
    priority:
      'Suggested priority. MUST be exactly one of the fixed IDs: low, medium, high, urgent (do NOT translate these values).',
    confidence: 'Overall confidence of the classification (0 to 1).',
  },
};

const NOTE_DESCRIPTIONS: Record<Locale, Record<keyof NoteTagging, string>> = {
  es: {
    tags: 'Tags relevantes para la nota (max 5)',
    summary: 'Resumen de una linea de la nota',
    suggestedNoteType:
      'Tipo Zettelkasten que mejor encaja: fleeting (captura cruda), literature (cita o resume fuente externa), permanent (idea atomica original del autor).',
    noteTypeConfidence: 'Confianza de la clasificacion suggestedNoteType (0 a 1).',
  },
  en: {
    tags: 'Relevant tags for the note (max 5)',
    summary: 'One-line summary of the note',
    suggestedNoteType:
      'Zettelkasten type that best fits: fleeting (raw capture), literature (quotes or summarizes an external source), permanent (original atomic idea by the author). MUST be exactly one of the fixed IDs: fleeting, literature, permanent (do NOT translate these values).',
    noteTypeConfidence: 'Confidence of the suggestedNoteType classification (0 to 1).',
  },
};

export function buildInboxSchema(locale: Locale) {
  const d = INBOX_DESCRIPTIONS[locale];
  return {
    type: 'object' as const,
    properties: {
      suggestedTitle: { type: 'string', description: d.suggestedTitle },
      suggestedType: {
        type: 'string',
        enum: [...INBOX_TYPES],
        description: d.suggestedType,
      },
      suggestedTags: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
        description: d.suggestedTags,
      },
      suggestedArea: {
        type: 'string',
        enum: [...INBOX_AREAS],
        description: d.suggestedArea,
      },
      summary: { type: 'string', description: d.summary },
      priority: {
        type: 'string',
        enum: [...INBOX_PRIORITIES],
        description: d.priority,
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: d.confidence,
      },
    },
    required: [
      'suggestedTitle',
      'suggestedType',
      'suggestedTags',
      'suggestedArea',
      'summary',
      'priority',
      'confidence',
    ],
    additionalProperties: false,
  };
}

export interface InboxClassification {
  suggestedTitle: string;
  suggestedType: InboxType;
  suggestedTags: string[];
  suggestedArea: InboxArea;
  summary: string;
  priority: InboxPriority;
  confidence: number;
}

export function buildNoteSchema(locale: Locale) {
  const d = NOTE_DESCRIPTIONS[locale];
  return {
    type: 'object' as const,
    properties: {
      tags: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
        description: d.tags,
      },
      summary: { type: 'string', description: d.summary },
      suggestedNoteType: {
        type: 'string',
        enum: [...NOTE_TYPES],
        description: d.suggestedNoteType,
      },
      noteTypeConfidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: d.noteTypeConfidence,
      },
    },
    required: ['tags', 'summary', 'suggestedNoteType', 'noteTypeConfidence'],
    additionalProperties: false,
  };
}

export interface NoteTagging {
  tags: string[];
  summary: string;
  suggestedNoteType: SuggestedNoteType;
  noteTypeConfidence: number;
}
