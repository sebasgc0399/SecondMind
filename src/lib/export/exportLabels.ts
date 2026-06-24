// Bundle de catálogos key->label para el export (SPEC-67, D5). Se construye UNA
// vez con el t() del cliente (locale activo) y se pasa a los serializadores —
// el argumento decisivo de D4 client-side: las keys opacas (area/paraType/
// noteType/priority/status/hábitos) son locale-dependientes y solo el cliente
// tiene el i18n cargado. tagIds NO entra: ya son labels legibles.

import type {
  NoteType,
  ParaType,
  Priority,
  ObjectiveStatus,
  ProjectStatus,
  TaskStatus,
} from '@/types/common';
import type { AreaKey } from '@/types/area';
import type { HabitKey } from '@/types/habit';
import {
  buildAreaLabels,
  buildHabitLabels,
  buildNoteTypeLabels,
  buildObjectiveStatusLabels,
  buildParaTypeLabels,
  buildPriorityLabels,
  buildProjectStatusLabels,
  buildTaskStatusLabels,
} from '@/lib/entityLabels';
import type { TFunction } from 'i18next';

export interface ExportLabels {
  area: Record<AreaKey, string>;
  habit: Record<HabitKey, string>;
  paraType: Record<ParaType, string>;
  noteType: Record<NoteType, string>;
  priority: Record<Priority, string>;
  taskStatus: Record<TaskStatus, string>;
  projectStatus: Record<ProjectStatus, string>;
  objectiveStatus: Record<ObjectiveStatus, string>;
}

export function buildExportLabels(t: TFunction): ExportLabels {
  return {
    area: buildAreaLabels(t),
    habit: buildHabitLabels(t),
    paraType: buildParaTypeLabels(t),
    noteType: buildNoteTypeLabels(t),
    priority: buildPriorityLabels(t),
    taskStatus: buildTaskStatusLabels(t),
    projectStatus: buildProjectStatusLabels(t),
    objectiveStatus: buildObjectiveStatusLabels(t),
  };
}

// Resuelve una key opaca a su label; si la key no está en el catálogo (valor
// inesperado), devuelve la key cruda para no perder el dato.
export function labelOr<K extends string>(record: Record<K, string>, key: string): string {
  return (record as Record<string, string>)[key] ?? key;
}
