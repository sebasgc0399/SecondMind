import { createStore } from 'tinybase';

export const linksStore = createStore().setTablesSchema({
  links: {
    sourceId: { type: 'string', default: '' },
    targetId: { type: 'string', default: '' },
    sourceTitle: { type: 'string', default: '' },
    targetTitle: { type: 'string', default: '' },
    context: { type: 'string', default: '' },
    linkType: { type: 'string', default: 'explicit' },
    strength: { type: 'number', default: 0 },
    accepted: { type: 'boolean', default: true },
    createdAt: { type: 'number', default: 0 },
  },
});
