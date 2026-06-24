// Shaping + filtros D6 del export (SPEC-67), PURO (sin Firebase ni stores) para
// poder testearlo con fixtures. El I/O (getDocs + getTable) vive en
// collectExportData.ts y delega acá.
//
// FILTROS D6 (corrección con cara legal):
//  - notes: EXCLUIR papelera (deletedAt > 0). Incluir activas Y archivadas.
//  - inbox: EXCLUIR dismissed. Incluir pending y processed.
//  - tasks/projects/objectives/habits: incluir todo (no tienen papelera; los
//    archivados son Contenido vivo → DENTRO).
// Una nota con content corrupto (JSON inválido) NO aborta el batch: cae a doc vacío.

import { HABITS, type HabitKey } from '@/types/habit';
import type { JSONContent } from '@tiptap/core';
import type { ExportNoteRef } from './filenames';
import type {
  ExportData,
  ExportHabitDay,
  ExportInboxItem,
  ExportNote,
  ExportObjective,
  ExportProject,
  ExportTask,
} from './exportTypes';

export interface RawDoc {
  id: string;
  data: Record<string, unknown>;
}
export type RawTable = Record<string, Record<string, unknown>>;

export interface RawExportInput {
  notes: RawDoc[];
  tasks: RawTable;
  projects: RawTable;
  objectives: RawTable;
  habits: RawTable;
  inbox: RawTable;
}

const EMPTY_DOC: JSONContent = { type: 'doc', content: [] };

function parseContentDoc(raw: unknown): JSONContent {
  if (typeof raw !== 'string' || raw.length === 0) return EMPTY_DOC;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && (parsed as JSONContent).type === 'doc') {
      return parsed as JSONContent;
    }
  } catch {
    // content corrupto → doc vacío, NO romper el batch
  }
  return EMPTY_DOC;
}

function parseIdArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}
function bool(v: unknown): boolean {
  return v === true;
}

function tableToRows(table: RawTable): RawDoc[] {
  return Object.entries(table).map(([id, data]) => ({ id, data }));
}

const byCreatedAt = (a: { createdAt: number }, b: { createdAt: number }) =>
  a.createdAt - b.createdAt;

export function shapeExportData(input: RawExportInput): ExportData {
  // D6: papelera (deletedAt > 0) FUERA; activas + archivadas DENTRO.
  const notes: ExportNote[] = input.notes
    .filter((n) => !(num(n.data.deletedAt) > 0))
    .map((n) => ({
      id: n.id,
      title: str(n.data.title),
      contentDoc: parseContentDoc(n.data.content),
      summaryL3: str(n.data.summaryL3),
      source: str(n.data.source),
      paraType: str(n.data.paraType, 'resource'),
      noteType: str(n.data.noteType, 'fleeting'),
      tagIds: parseIdArray(n.data.tagIds),
      isArchived: bool(n.data.isArchived),
      createdAt: num(n.data.createdAt),
      updatedAt: num(n.data.updatedAt),
    }))
    .sort(byCreatedAt);

  const noteRefs: ExportNoteRef[] = notes.map((n) => ({ id: n.id, title: n.title }));

  const tasks: ExportTask[] = tableToRows(input.tasks)
    .map((r) => ({
      id: r.id,
      name: str(r.data.name),
      description: str(r.data.description),
      status: str(r.data.status),
      priority: str(r.data.priority),
      dueDate: num(r.data.dueDate),
      completedAt: num(r.data.completedAt),
      projectId: str(r.data.projectId),
      areaId: str(r.data.areaId),
      objectiveId: str(r.data.objectiveId),
      noteIds: parseIdArray(r.data.noteIds),
      isArchived: bool(r.data.isArchived),
      createdAt: num(r.data.createdAt),
    }))
    .sort(byCreatedAt);

  const projects: ExportProject[] = tableToRows(input.projects)
    .map((r) => ({
      id: r.id,
      name: str(r.data.name),
      status: str(r.data.status),
      priority: str(r.data.priority),
      areaId: str(r.data.areaId),
      objectiveId: str(r.data.objectiveId),
      taskIds: parseIdArray(r.data.taskIds),
      noteIds: parseIdArray(r.data.noteIds),
      startDate: num(r.data.startDate),
      deadline: num(r.data.deadline),
      isArchived: bool(r.data.isArchived),
      createdAt: num(r.data.createdAt),
    }))
    .sort(byCreatedAt);

  const objectives: ExportObjective[] = tableToRows(input.objectives)
    .map((r) => ({
      id: r.id,
      name: str(r.data.name),
      status: str(r.data.status),
      deadline: num(r.data.deadline),
      areaId: str(r.data.areaId),
      projectIds: parseIdArray(r.data.projectIds),
      taskIds: parseIdArray(r.data.taskIds),
      isArchived: bool(r.data.isArchived),
      createdAt: num(r.data.createdAt),
    }))
    .sort(byCreatedAt);

  const habitKeys = HABITS.map((h) => h.key);
  const habits: ExportHabitDay[] = tableToRows(input.habits)
    .map((r) => ({
      id: r.id,
      date: num(r.data.date),
      done: habitKeys.filter((k) => r.data[k] === true) as HabitKey[],
      progress: num(r.data.progress),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // D6: dismissed FUERA; pending + processed DENTRO.
  const inbox: ExportInboxItem[] = tableToRows(input.inbox)
    .filter((r) => str(r.data.status) !== 'dismissed')
    .map((r) => ({
      id: r.id,
      rawContent: str(r.data.rawContent),
      source: str(r.data.source),
      sourceUrl: str(r.data.sourceUrl),
      status: str(r.data.status),
      createdAt: num(r.data.createdAt),
    }))
    .sort(byCreatedAt);

  return { notes, tasks, projects, objectives, habits, inbox, noteRefs };
}
