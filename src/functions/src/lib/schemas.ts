export const INBOX_CLASSIFICATION_SCHEMA = {
  type: 'object' as const,
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
    summary: {
      type: 'string',
      description: 'Resumen de una linea',
    },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'urgent'],
      description: 'Prioridad sugerida',
    },
  },
  required: [
    'suggestedTitle',
    'suggestedType',
    'suggestedTags',
    'suggestedArea',
    'summary',
    'priority',
  ],
  additionalProperties: false,
};

export interface InboxClassification {
  suggestedTitle: string;
  suggestedType: 'note' | 'task' | 'project' | 'trash';
  suggestedTags: string[];
  suggestedArea: 'proyectos' | 'conocimiento' | 'finanzas' | 'salud' | 'pareja' | 'habitos';
  summary: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export const NOTE_TAGGING_SCHEMA = {
  type: 'object' as const,
  properties: {
    tags: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 5,
      description: 'Tags relevantes para la nota (max 5)',
    },
    summary: {
      type: 'string',
      description: 'Resumen de una linea de la nota',
    },
  },
  required: ['tags', 'summary'],
  additionalProperties: false,
};

export interface NoteTagging {
  tags: string[];
  summary: string;
}
