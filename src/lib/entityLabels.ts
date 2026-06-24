import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Priority,
  ObjectiveStatus,
  ProjectStatus,
  TaskStatus,
  NoteType,
  ParaType,
} from '@/types/common';
import type { InboxResultType } from '@/types/inbox';
import type { AreaKey } from '@/types/area';
import type { HabitKey } from '@/types/habit';
import type { TFunction } from 'i18next';

// F58 F2.7: punto único de verdad para los labels de enum de entidad, antes
// dispersos/duplicados en 4+ archivos cada uno. Patrón (molde navItems /
// slashMenuItems): factory `buildX(t)` materializa el Record con t(); hook
// fino `useX()` lo envuelve en useMemo([t]) para reactividad al cambiar de
// idioma. Los KEYS de cada Record son enum-values estables (IDs opacos
// persistidos en Firestore, D5) — el label es SOLO display, nunca
// clave/sort/filtro ni key de React. Consumidores module-scope (inboxRepo,
// discardableEntries) NO usan estos hooks: llaman i18n.t directo.
// Keys del catálogo con guion (not-started) → camelCase (notStarted) para
// evitar fricción del generador de tipos `i18next-cli types`.

// --- Priority (badge / select corto) ---
export function buildPriorityLabels(t: TFunction): Record<Priority, string> {
  return {
    low: t('entities.priority.low', 'Baja'),
    medium: t('entities.priority.medium', 'Media'),
    high: t('entities.priority.high', 'Alta'),
    urgent: t('entities.priority.urgent', 'Urgente'),
  };
}

export function usePriorityLabels(): Record<Priority, string> {
  const { t } = useTranslation();
  return useMemo(() => buildPriorityLabels(t), [t]);
}

// --- Priority variante LARGA (aria-label/title de TasksTodayCard) ---
export function buildPriorityLongLabels(t: TFunction): Record<Priority, string> {
  return {
    low: t('entities.priorityLong.low', 'Prioridad baja'),
    medium: t('entities.priorityLong.medium', 'Prioridad media'),
    high: t('entities.priorityLong.high', 'Prioridad alta'),
    urgent: t('entities.priorityLong.urgent', 'Prioridad urgente'),
  };
}

export function usePriorityLongLabels(): Record<Priority, string> {
  const { t } = useTranslation();
  return useMemo(() => buildPriorityLongLabels(t), [t]);
}

// --- ObjectiveStatus ---
export function buildObjectiveStatusLabels(t: TFunction): Record<ObjectiveStatus, string> {
  return {
    'not-started': t('entities.objectiveStatus.notStarted', 'No empezado'),
    'in-progress': t('entities.objectiveStatus.inProgress', 'En progreso'),
    completed: t('entities.objectiveStatus.completed', 'Completado'),
  };
}

export function useObjectiveStatusLabels(): Record<ObjectiveStatus, string> {
  const { t } = useTranslation();
  return useMemo(() => buildObjectiveStatusLabels(t), [t]);
}

// --- ProjectStatus: dos copys distintos sobre el mismo enum ---
// group = headers plurales (projects/page.tsx); el orden refleja STATUS_ORDER.
export function buildProjectStatusGroupLabels(t: TFunction): Record<ProjectStatus, string> {
  return {
    inbox: t('entities.projectStatus.group.inbox', 'Sin clasificar'),
    'not-started': t('entities.projectStatus.group.notStarted', 'No empezados'),
    'in-progress': t('entities.projectStatus.group.inProgress', 'En progreso'),
    'on-hold': t('entities.projectStatus.group.onHold', 'En pausa'),
    completed: t('entities.projectStatus.group.completed', 'Completados'),
  };
}

export function useProjectStatusGroupLabels(): Record<ProjectStatus, string> {
  const { t } = useTranslation();
  return useMemo(() => buildProjectStatusGroupLabels(t), [t]);
}

// option = singular para el select de edición ([projectId]/page.tsx).
// El orden de inserción define el orden de los <option> (inbox primero).
export function buildProjectStatusLabels(t: TFunction): Record<ProjectStatus, string> {
  return {
    inbox: t('entities.projectStatus.option.inbox', 'Inbox'),
    'not-started': t('entities.projectStatus.option.notStarted', 'No empezado'),
    'in-progress': t('entities.projectStatus.option.inProgress', 'En progreso'),
    'on-hold': t('entities.projectStatus.option.onHold', 'En pausa'),
    completed: t('entities.projectStatus.option.completed', 'Completado'),
  };
}

export function useProjectStatusLabels(): Record<ProjectStatus, string> {
  const { t } = useTranslation();
  return useMemo(() => buildProjectStatusLabels(t), [t]);
}

// --- TaskStatus (agregado para el export F67; antes no existía un labeler) ---
export function buildTaskStatusLabels(t: TFunction): Record<TaskStatus, string> {
  return {
    inbox: t('entities.taskStatus.inbox', 'Sin clasificar'),
    'in-progress': t('entities.taskStatus.inProgress', 'En progreso'),
    waiting: t('entities.taskStatus.waiting', 'En espera'),
    delegated: t('entities.taskStatus.delegated', 'Delegada'),
    completed: t('entities.taskStatus.completed', 'Completada'),
  };
}

export function useTaskStatusLabels(): Record<TaskStatus, string> {
  const { t } = useTranslation();
  return useMemo(() => buildTaskStatusLabels(t), [t]);
}

// --- InboxResultType (sugerencia AI: nota/tarea/proyecto/descartar) ---
export function buildInboxResultTypeLabels(t: TFunction): Record<InboxResultType, string> {
  return {
    note: t('entities.inboxResultType.note', 'Nota'),
    task: t('entities.inboxResultType.task', 'Tarea'),
    project: t('entities.inboxResultType.project', 'Proyecto'),
    trash: t('entities.inboxResultType.trash', 'Descartar'),
  };
}

export function useInboxResultTypeLabels(): Record<InboxResultType, string> {
  const { t } = useTranslation();
  return useMemo(() => buildInboxResultTypeLabels(t), [t]);
}

// --- NoteType (Fugaz/Literatura/Permanente). Antes en EN en grafo (bug) ---
export function buildNoteTypeLabels(t: TFunction): Record<NoteType, string> {
  return {
    fleeting: t('entities.noteType.fleeting', 'Fugaz'),
    literature: t('entities.noteType.literature', 'Literatura'),
    permanent: t('entities.noteType.permanent', 'Permanente'),
  };
}

export function useNoteTypeLabels(): Record<NoteType, string> {
  const { t } = useTranslation();
  return useMemo(() => buildNoteTypeLabels(t), [t]);
}

// --- ParaType (Proyecto/Área/Recurso/Archivo). 'Área' con tilde unificado ---
export function buildParaTypeLabels(t: TFunction): Record<ParaType, string> {
  return {
    project: t('entities.paraType.project', 'Proyecto'),
    area: t('entities.paraType.area', 'Área'),
    resource: t('entities.paraType.resource', 'Recurso'),
    archive: t('entities.paraType.archive', 'Archivo'),
  };
}

export function useParaTypeLabels(): Record<ParaType, string> {
  const { t } = useTranslation();
  return useMemo(() => buildParaTypeLabels(t), [t]);
}

// --- AREAS (D5: keys = IDs opacos persistidos; solo el label se localiza) ---
export function buildAreaLabels(t: TFunction): Record<AreaKey, string> {
  return {
    proyectos: t('entities.area.proyectos', 'Proyectos'),
    conocimiento: t('entities.area.conocimiento', 'Conocimiento'),
    finanzas: t('entities.area.finanzas', 'Finanzas'),
    salud: t('entities.area.salud', 'Salud y Ejercicio'),
    pareja: t('entities.area.pareja', 'Pareja'),
    habitos: t('entities.area.habitos', 'Hábitos'),
  };
}

export function useAreaLabels(): Record<AreaKey, string> {
  const { t } = useTranslation();
  return useMemo(() => buildAreaLabels(t), [t]);
}

// --- HABITS (D5: keys = IDs opacos persistidos; solo el label se localiza) ---
export function buildHabitLabels(t: TFunction): Record<HabitKey, string> {
  return {
    ejercicio: t('entities.habit.ejercicio', 'Ejercicio'),
    codear: t('entities.habit.codear', 'Codear'),
    leer: t('entities.habit.leer', 'Leer'),
    meditar: t('entities.habit.meditar', 'Meditar'),
    comerBien: t('entities.habit.comerBien', 'Comer bien'),
    tomarAgua: t('entities.habit.tomarAgua', 'Tomar agua'),
    planificarDia: t('entities.habit.planificarDia', 'Planificar día'),
    madrugar: t('entities.habit.madrugar', 'Madrugar'),
    gratitud: t('entities.habit.gratitud', 'Gratitud'),
    ingles: t('entities.habit.ingles', 'Inglés'),
    pareja: t('entities.habit.pareja', 'Pareja'),
    estirar: t('entities.habit.estirar', 'Estirar'),
    tenderCama: t('entities.habit.tenderCama', 'Tender cama'),
    noComerDulce: t('entities.habit.noComerDulce', 'No comer dulce'),
  };
}

export function useHabitLabels(): Record<HabitKey, string> {
  const { t } = useTranslation();
  return useMemo(() => buildHabitLabels(t), [t]);
}

// --- Pending sync (sing/plur por índice, alineado a allQueues) ---
// NO son pluralización gramatical i18next (edición vs creación): keys planas
// *.sing/*.plur, nunca variable `count` ni sufijos _one/_other.
export interface PendingSyncLabel {
  sing: string;
  plur: string;
}

export function buildPendingSyncLabels(t: TFunction): ReadonlyArray<PendingSyncLabel> {
  return [
    {
      sing: t('entities.pendingSync.noteEdit.sing', 'edición de nota'),
      plur: t('entities.pendingSync.noteEdit.plur', 'ediciones de nota'),
    },
    {
      sing: t('entities.pendingSync.note.sing', 'nota'),
      plur: t('entities.pendingSync.note.plur', 'notas'),
    },
    {
      sing: t('entities.pendingSync.task.sing', 'tarea'),
      plur: t('entities.pendingSync.task.plur', 'tareas'),
    },
    {
      sing: t('entities.pendingSync.project.sing', 'proyecto'),
      plur: t('entities.pendingSync.project.plur', 'proyectos'),
    },
    {
      sing: t('entities.pendingSync.objective.sing', 'objetivo'),
      plur: t('entities.pendingSync.objective.plur', 'objetivos'),
    },
    {
      sing: t('entities.pendingSync.habit.sing', 'hábito'),
      plur: t('entities.pendingSync.habit.plur', 'hábitos'),
    },
    {
      sing: t('entities.pendingSync.inboxItem.sing', 'item de inbox'),
      plur: t('entities.pendingSync.inboxItem.plur', 'items de inbox'),
    },
    {
      sing: t('entities.pendingSync.noteNew.sing', 'nota nueva'),
      plur: t('entities.pendingSync.noteNew.plur', 'notas nuevas'),
    },
    {
      sing: t('entities.pendingSync.taskNew.sing', 'tarea nueva'),
      plur: t('entities.pendingSync.taskNew.plur', 'tareas nuevas'),
    },
    {
      sing: t('entities.pendingSync.projectNew.sing', 'proyecto nuevo'),
      plur: t('entities.pendingSync.projectNew.plur', 'proyectos nuevos'),
    },
    {
      sing: t('entities.pendingSync.objectiveNew.sing', 'objetivo nuevo'),
      plur: t('entities.pendingSync.objectiveNew.plur', 'objetivos nuevos'),
    },
  ];
}

export function usePendingSyncLabels(): ReadonlyArray<PendingSyncLabel> {
  const { t } = useTranslation();
  return useMemo(() => buildPendingSyncLabels(t), [t]);
}
