import type { NoteType, ParaType } from '@/types/common';

export interface Note {
  id: string;
  title: string;
  content: string;
  contentPlain: string;
  paraType: ParaType;
  noteType: NoteType;
  source?: string;
  projectIds: string[];
  areaIds: string[];
  tagIds: string[];
  outgoingLinkIds: string[];
  incomingLinkIds: string[];
  linkCount: number;
  summaryL1?: string;
  summaryL2?: string;
  summaryL3?: string;
  distillLevel: 0 | 1 | 2 | 3;
  aiTags?: string[];
  aiSummary?: string;
  aiProcessed: boolean;
  createdAt: number;
  updatedAt: number;
  lastViewedAt?: number;
  viewCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  deletedAt: number | null;
  fsrsState?: string;
  fsrsDue?: number;
  fsrsLastReview?: number;
}

// Subset usado en la papelera (/notes filtro "Papelera"). Reutiliza los
// campos de NoteOramaDoc que NoteCard renderiza, agrega daysUntilPurge
// derivado de preferences.trashAutoPurgeDays + deletedAt. null cuando
// trashAutoPurgeDays === 0 ("Nunca").
export interface TrashNote {
  id: string;
  title: string;
  contentPlain: string;
  paraType: string;
  noteType: string;
  distillLevel: 0 | 1 | 2 | 3;
  linkCount: number;
  isFavorite: boolean;
  updatedAt: number;
  deletedAt: number;
  daysUntilPurge: number | null;
}
