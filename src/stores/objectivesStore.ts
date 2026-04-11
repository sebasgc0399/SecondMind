import { createStore } from 'tinybase';

// Un objetivo pertenece a UN área, pero agrupa N proyectos y N tareas.
// El progreso se calcula en render desde los proyectos vinculados.
export const objectivesStore = createStore().setTablesSchema({
  objectives: {
    name: { type: 'string', default: '' },
    status: { type: 'string', default: 'not-started' },
    deadline: { type: 'number', default: 0 },
    areaId: { type: 'string', default: '' },
    projectIds: { type: 'string', default: '[]' },
    taskIds: { type: 'string', default: '[]' },
    isArchived: { type: 'boolean', default: false },
    createdAt: { type: 'number', default: 0 },
    updatedAt: { type: 'number', default: 0 },
  },
});
