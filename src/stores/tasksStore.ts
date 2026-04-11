import { createStore } from 'tinybase';

// Arrays (noteIds) se serializan como JSON string con default '[]'.
// Timestamps como unix ms. projectId/areaId/objectiveId son singulares
// (una tarea pertenece a UN proyecto/área/objetivo) — NO arrays.
export const tasksStore = createStore().setTablesSchema({
  tasks: {
    name: { type: 'string', default: '' },
    status: { type: 'string', default: 'in-progress' },
    priority: { type: 'string', default: 'medium' },
    dueDate: { type: 'number', default: 0 },
    projectId: { type: 'string', default: '' },
    areaId: { type: 'string', default: '' },
    objectiveId: { type: 'string', default: '' },
    noteIds: { type: 'string', default: '[]' },
    description: { type: 'string', default: '' },
    isArchived: { type: 'boolean', default: false },
    createdAt: { type: 'number', default: 0 },
    updatedAt: { type: 'number', default: 0 },
    completedAt: { type: 'number', default: 0 },
  },
});
