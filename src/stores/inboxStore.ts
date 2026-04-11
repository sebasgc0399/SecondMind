import { createStore } from 'tinybase';

// `aiResult` y `processedAs` se serializan como JSON string. Son objetos
// anidados que TinyBase no soporta en el schema. Parsear on-demand con
// JSON.parse al consumir desde hooks.
export const inboxStore = createStore().setTablesSchema({
  inbox: {
    rawContent: { type: 'string', default: '' },
    source: { type: 'string', default: 'quick-capture' },
    sourceUrl: { type: 'string', default: '' },
    aiProcessed: { type: 'boolean', default: false },
    aiResult: { type: 'string', default: '' },
    status: { type: 'string', default: 'pending' },
    processedAs: { type: 'string', default: '' },
    createdAt: { type: 'number', default: 0 },
  },
});
