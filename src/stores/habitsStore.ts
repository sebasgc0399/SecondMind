import { createStore } from 'tinybase';

// Un doc por día en users/{uid}/habits/{YYYY-MM-DD}. Los 14 hábitos están
// hardcoded (ver src/types/habit.ts). ID determinístico evita duplicados
// por día. El progress (0-100) se calcula client-side al togglear.
export const habitsStore = createStore().setTablesSchema({
  habits: {
    date: { type: 'number', default: 0 },
    ejercicio: { type: 'boolean', default: false },
    codear: { type: 'boolean', default: false },
    leer: { type: 'boolean', default: false },
    meditar: { type: 'boolean', default: false },
    comerBien: { type: 'boolean', default: false },
    tomarAgua: { type: 'boolean', default: false },
    planificarDia: { type: 'boolean', default: false },
    madrugar: { type: 'boolean', default: false },
    gratitud: { type: 'boolean', default: false },
    ingles: { type: 'boolean', default: false },
    pareja: { type: 'boolean', default: false },
    estirar: { type: 'boolean', default: false },
    tenderCama: { type: 'boolean', default: false },
    noComerDulce: { type: 'boolean', default: false },
    progress: { type: 'number', default: 0 },
    createdAt: { type: 'number', default: 0 },
    updatedAt: { type: 'number', default: 0 },
  },
});
