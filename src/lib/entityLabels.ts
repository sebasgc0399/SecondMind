import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Priority, ObjectiveStatus, ProjectStatus } from '@/types/common';
import type { InboxResultType } from '@/types/inbox';
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
