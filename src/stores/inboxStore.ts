import { createStore } from 'tinybase';

// `processedAs` se serializa como JSON string porque TinyBase no soporta
// objetos anidados en el schema. Los campos de la sugerencia de Claude
// (`aiSuggested*`, `aiSummary`, `aiPriority`) se almacenan flat y el hook
// `useInbox` los reensambla en un objeto `aiResult` al leer.
export const inboxStore = createStore().setTablesSchema({
  inbox: {
    rawContent: { type: 'string', default: '' },
    source: { type: 'string', default: 'quick-capture' },
    sourceUrl: { type: 'string', default: '' },
    aiProcessed: { type: 'boolean', default: false },
    aiSuggestedTitle: { type: 'string', default: '' },
    aiSuggestedType: { type: 'string', default: '' },
    aiSuggestedTags: { type: 'string', default: '[]' },
    aiSuggestedArea: { type: 'string', default: '' },
    aiSummary: { type: 'string', default: '' },
    aiPriority: { type: 'string', default: '' },
    aiConfidence: { type: 'number', default: 0 },
    status: { type: 'string', default: 'pending' },
    processedAs: { type: 'string', default: '' },
    createdAt: { type: 'number', default: 0 },
  },
});
