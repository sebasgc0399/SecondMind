// Tipos del payload de export (SPEC-67). Shapes ya filtrados (D6) y parseados,
// listos para serializar a Markdown (F4). Solo Contenido del usuario (D1):
// los campos derivados (AI/FSRS, aiSummary, links ai-suggested) NO entran.

import type { HabitKey } from '@/types/habit';
import type { JSONContent } from '@tiptap/core';
import type { ExportNoteRef } from './filenames';

export interface ExportNote {
  id: string;
  title: string;
  contentDoc: JSONContent; // TipTap JSON ya parseado (defensivo)
  summaryL3: string; // resumen del usuario (D1: SÍ; aiSummary NO)
  source: string;
  paraType: string;
  noteType: string;
  tagIds: string[]; // labels legibles (no hay catálogo)
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ExportTask {
  id: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  dueDate: number;
  completedAt: number;
  projectId: string;
  areaId: string;
  objectiveId: string;
  noteIds: string[];
  isArchived: boolean;
  createdAt: number;
}

export interface ExportProject {
  id: string;
  name: string;
  status: string;
  priority: string;
  areaId: string;
  objectiveId: string;
  taskIds: string[];
  noteIds: string[];
  startDate: number;
  deadline: number;
  isArchived: boolean;
  createdAt: number;
}

export interface ExportObjective {
  id: string;
  name: string;
  status: string;
  deadline: number;
  areaId: string;
  projectIds: string[];
  taskIds: string[];
  isArchived: boolean;
  createdAt: number;
}

export interface ExportHabitDay {
  id: string; // YYYY-MM-DD
  date: number;
  done: HabitKey[]; // solo los hábitos marcados ese día (compacto, D5)
  progress: number;
}

export interface ExportInboxItem {
  id: string;
  rawContent: string;
  source: string;
  sourceUrl: string;
  status: string;
  createdAt: number;
}

export interface ExportData {
  notes: ExportNote[];
  tasks: ExportTask[];
  projects: ExportProject[];
  objectives: ExportObjective[];
  habits: ExportHabitDay[];
  inbox: ExportInboxItem[];
  // Referencias (id + título fresco) de las notas EXPORTABLES, para construir
  // el resolver de wikilinks (D3): un link a una nota fuera de este set = dangling.
  noteRefs: ExportNoteRef[];
}
