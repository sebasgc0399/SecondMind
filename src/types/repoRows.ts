import type { RepoRow } from '@/infra/repos/baseRepo';

// Schema TinyBase de notes — NO incluye `content` (el JSON TipTap solo
// vive en Firestore, gotcha universal del proyecto). saveContent en
// notesRepo usa updateDoc directo con `content` en el payload remoto.
export interface NoteRow extends RepoRow {
  title: string;
  contentPlain: string;
  paraType: string;
  noteType: string;
  source: string;
  projectIds: string;
  areaIds: string;
  tagIds: string;
  outgoingLinkIds: string;
  incomingLinkIds: string;
  linkCount: number;
  summaryL3: string;
  distillLevel: number;
  aiTags: string;
  aiSummary: string;
  aiProcessed: boolean;
  createdAt: number;
  updatedAt: number;
  lastViewedAt: number;
  viewCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  // Sentinel `0` = no eliminada. `> 0` = timestamp ms del soft delete.
  // TinyBase Cell types no soportan null, por eso 0; el dominio
  // (`Note.deletedAt: number | null`) sí expone null.
  deletedAt: number;
  fsrsState: string;
  fsrsDue: number;
  fsrsLastReview: number;
}

// Row serializada para TinyBase/Firestore (noteIds como JSON string).
export interface TaskRow extends RepoRow {
  name: string;
  status: string;
  priority: string;
  dueDate: number;
  projectId: string;
  areaId: string;
  objectiveId: string;
  noteIds: string;
  description: string;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number;
}

export interface ProjectRow extends RepoRow {
  name: string;
  status: string;
  priority: string;
  areaId: string;
  objectiveId: string;
  taskIds: string;
  noteIds: string;
  startDate: number;
  deadline: number;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ObjectiveRow extends RepoRow {
  name: string;
  status: string;
  deadline: number;
  areaId: string;
  projectIds: string;
  taskIds: string;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

// Schema del row en TinyBase/Firestore — doc por día, IDs YYYY-MM-DD
// (ver habitsStore.ts). setPartialRow sobre un id inexistente crea la row
// con defaults del schema, por eso toggleHabit puede usar update() para
// ambos casos (create al primer toggle del día + update en siguientes).
export interface HabitRow extends RepoRow {
  date: number;
  ejercicio: boolean;
  codear: boolean;
  leer: boolean;
  meditar: boolean;
  comerBien: boolean;
  tomarAgua: boolean;
  planificarDia: boolean;
  madrugar: boolean;
  gratitud: boolean;
  ingles: boolean;
  pareja: boolean;
  estirar: boolean;
  tenderCama: boolean;
  noComerDulce: boolean;
  progress: number;
  createdAt: number;
  updatedAt: number;
}

export interface InboxRow extends RepoRow {
  rawContent: string;
  source: string;
  sourceUrl: string;
  status: string;
  processedAs: string;
  aiProcessed: boolean;
  aiSuggestedTitle: string;
  aiSuggestedType: string;
  aiSuggestedTags: string;
  aiSuggestedArea: string;
  aiSummary: string;
  aiPriority: string;
  aiConfidence: number;
  createdAt: number;
}
