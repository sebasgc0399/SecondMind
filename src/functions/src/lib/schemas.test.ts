import { describe, expect, it } from 'vitest';
import { buildInboxSchema, buildNoteSchema } from './schemas';

// F3.1 (SPEC-58) — assert de PARIDAD es. Garantiza que el refactor de schemas
// const→builder NO cambió el prompt-surface es (cero-regresión sin depender del
// LLM). Los golden son copias byte-idénticas de los schemas es ANTES del refactor.
const GOLDEN_INBOX_ES = {
  type: 'object',
  properties: {
    suggestedTitle: {
      type: 'string',
      description: 'Titulo conciso para la captura (max 80 caracteres)',
    },
    suggestedType: {
      type: 'string',
      enum: ['note', 'task', 'project', 'trash'],
      description: 'Tipo sugerido de la captura',
    },
    suggestedTags: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 5,
      description: 'Tags relevantes (max 5)',
    },
    suggestedArea: {
      type: 'string',
      enum: ['proyectos', 'conocimiento', 'finanzas', 'salud', 'pareja', 'habitos'],
      description: 'Area de vida a la que pertenece',
    },
    summary: { type: 'string', description: 'Resumen de una linea' },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'urgent'],
      description: 'Prioridad sugerida',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confianza global de la clasificacion (0 a 1).',
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

const GOLDEN_NOTE_ES = {
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 5,
      description: 'Tags relevantes para la nota (max 5)',
    },
    summary: { type: 'string', description: 'Resumen de una linea de la nota' },
    suggestedNoteType: {
      type: 'string',
      enum: ['fleeting', 'literature', 'permanent'],
      description:
        'Tipo Zettelkasten que mejor encaja: fleeting (captura cruda), literature (cita o resume fuente externa), permanent (idea atomica original del autor).',
    },
    noteTypeConfidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confianza de la clasificacion suggestedNoteType (0 a 1).',
    },
  },
  required: ['tags', 'summary', 'suggestedNoteType', 'noteTypeConfidence'],
  additionalProperties: false,
};

describe('schema builders (F3.1) — paridad es byte-idéntica', () => {
  it('buildInboxSchema("es") deep-equal al schema inbox es original', () => {
    expect(buildInboxSchema('es')).toEqual(GOLDEN_INBOX_ES);
  });

  it('buildNoteSchema("es") deep-equal al schema note es original', () => {
    expect(buildNoteSchema('es')).toEqual(GOLDEN_NOTE_ES);
  });
});

describe('schema builders (F3.1) — en cambia solo descriptions, nunca enums/shape', () => {
  it('inbox en: enums y shape idénticos al es, descriptions distintas', () => {
    const en = buildInboxSchema('en');
    expect(en.properties.suggestedType.enum).toEqual(['note', 'task', 'project', 'trash']);
    expect(en.properties.suggestedArea.enum).toEqual([
      'proyectos',
      'conocimiento',
      'finanzas',
      'salud',
      'pareja',
      'habitos',
    ]);
    expect(en.properties.priority.enum).toEqual(['low', 'medium', 'high', 'urgent']);
    expect(en.required).toEqual(GOLDEN_INBOX_ES.required);
    expect(en.additionalProperties).toBe(false);
    expect(en.properties.summary.description).not.toBe(
      GOLDEN_INBOX_ES.properties.summary.description,
    );
  });

  it('note en: enum y shape idénticos al es, descriptions distintas', () => {
    const en = buildNoteSchema('en');
    expect(en.properties.suggestedNoteType.enum).toEqual(['fleeting', 'literature', 'permanent']);
    expect(en.required).toEqual(GOLDEN_NOTE_ES.required);
    expect(en.additionalProperties).toBe(false);
    expect(en.properties.summary.description).not.toBe(
      GOLDEN_NOTE_ES.properties.summary.description,
    );
  });
});
