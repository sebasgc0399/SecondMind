import { createStore } from 'tinybase';

export const notesStore = createStore().setTablesSchema({
  notes: {
    title: { type: 'string', default: '' },
    contentPlain: { type: 'string', default: '' },
    paraType: { type: 'string', default: 'resource' },
    noteType: { type: 'string', default: 'fleeting' },
    distillLevel: { type: 'number', default: 0 },
    linkCount: { type: 'number', default: 0 },
    isFavorite: { type: 'boolean', default: false },
    isArchived: { type: 'boolean', default: false },
    aiProcessed: { type: 'boolean', default: false },
    viewCount: { type: 'number', default: 0 },
  },
});
