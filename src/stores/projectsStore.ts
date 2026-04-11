import { createStore } from 'tinybase';

// Arrays (taskIds, noteIds) se serializan como JSON string con default '[]'.
// Un proyecto pertenece a UN área/objetivo, pero contiene N tareas y N notas.
export const projectsStore = createStore().setTablesSchema({
  projects: {
    name: { type: 'string', default: '' },
    status: { type: 'string', default: 'not-started' },
    priority: { type: 'string', default: 'medium' },
    areaId: { type: 'string', default: '' },
    objectiveId: { type: 'string', default: '' },
    taskIds: { type: 'string', default: '[]' },
    noteIds: { type: 'string', default: '[]' },
    startDate: { type: 'number', default: 0 },
    deadline: { type: 'number', default: 0 },
    isArchived: { type: 'boolean', default: false },
    createdAt: { type: 'number', default: 0 },
    updatedAt: { type: 'number', default: 0 },
  },
});
