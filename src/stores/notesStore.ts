import { createStore } from 'tinybase';

// Arrays (projectIds, tagIds, outgoingLinkIds, etc.) se serializan como
// JSON string con default '[]'. TinyBase no soporta arrays nativamente.
// Timestamps se guardan como unix ms (number). El campo `content` (TipTap
// JSON) NO vive en TinyBase: se lee/escribe directo de Firestore al abrir
// el editor.
export const notesStore = createStore().setTablesSchema({
  notes: {
    title: { type: 'string', default: '' },
    contentPlain: { type: 'string', default: '' },
    paraType: { type: 'string', default: 'resource' },
    noteType: { type: 'string', default: 'fleeting' },
    source: { type: 'string', default: '' },
    projectIds: { type: 'string', default: '[]' },
    areaIds: { type: 'string', default: '[]' },
    tagIds: { type: 'string', default: '[]' },
    outgoingLinkIds: { type: 'string', default: '[]' },
    incomingLinkIds: { type: 'string', default: '[]' },
    linkCount: { type: 'number', default: 0 },
    summaryL1: { type: 'string', default: '' },
    summaryL2: { type: 'string', default: '' },
    summaryL3: { type: 'string', default: '' },
    distillLevel: { type: 'number', default: 0 },
    aiTags: { type: 'string', default: '[]' },
    aiSummary: { type: 'string', default: '' },
    aiProcessed: { type: 'boolean', default: false },
    createdAt: { type: 'number', default: 0 },
    updatedAt: { type: 'number', default: 0 },
    lastViewedAt: { type: 'number', default: 0 },
    viewCount: { type: 'number', default: 0 },
    isFavorite: { type: 'boolean', default: false },
    isArchived: { type: 'boolean', default: false },
    fsrsState: { type: 'string', default: '' },
    fsrsDue: { type: 'number', default: 0 },
    fsrsLastReview: { type: 'number', default: 0 },
  },
});
