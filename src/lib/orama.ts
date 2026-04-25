import { create, type AnyOrama } from '@orama/orama';
import type { Row } from 'tinybase';

// --- Global search schema (Command Palette F5) ---

export type GlobalDocType = 'note' | 'task' | 'project';

export const GLOBAL_SCHEMA = {
  id: 'string',
  _type: 'string',
  title: 'string',
  body: 'string',
  updatedAt: 'number',
  isArchived: 'boolean',
} as const;

export interface GlobalOramaDoc {
  id: string;
  _type: GlobalDocType;
  title: string;
  body: string;
  updatedAt: number;
  isArchived: boolean;
}

export function createGlobalIndex(): AnyOrama {
  return create({ schema: GLOBAL_SCHEMA });
}

export function noteRowToGlobalDoc(id: string, row: Row): GlobalOramaDoc {
  return {
    id,
    _type: 'note',
    title: ((row.title as string) || '').trim() || 'Sin título',
    body: (row.contentPlain as string) || '',
    updatedAt: Number(row.updatedAt) || 0,
    isArchived: Boolean(row.isArchived),
  };
}

export function taskRowToGlobalDoc(id: string, row: Row): GlobalOramaDoc {
  return {
    id,
    _type: 'task',
    title: ((row.name as string) || '').trim() || 'Sin título',
    body: (row.description as string) || '',
    updatedAt: Number(row.updatedAt) || 0,
    isArchived: Boolean(row.isArchived),
  };
}

export function projectRowToGlobalDoc(id: string, row: Row): GlobalOramaDoc {
  return {
    id,
    _type: 'project',
    title: ((row.name as string) || '').trim() || 'Sin título',
    body: '',
    updatedAt: Number(row.updatedAt) || 0,
    isArchived: Boolean(row.isArchived),
  };
}

export const NOTES_SCHEMA = {
  id: 'string',
  title: 'string',
  contentPlain: 'string',
  noteType: 'string',
  paraType: 'string',
  linkCount: 'number',
  updatedAt: 'number',
  isArchived: 'boolean',
  isFavorite: 'boolean',
  deletedAt: 'number',
  distillLevel: 'number',
} as const;

export interface NoteOramaDoc {
  id: string;
  title: string;
  contentPlain: string;
  noteType: string;
  paraType: string;
  linkCount: number;
  updatedAt: number;
  isArchived: boolean;
  isFavorite: boolean;
  deletedAt: number;
  distillLevel: 0 | 1 | 2 | 3;
}

export function createNotesIndex(): AnyOrama {
  return create({ schema: NOTES_SCHEMA });
}

// Convierte una row de TinyBase al shape del schema Orama. TinyBase guarda
// arrays como JSON strings, booleanos pueden venir como undefined si la row
// fue creada parcialmente — normalizamos a defaults seguros.
export function rowToOramaDoc(id: string, row: Row): NoteOramaDoc {
  const rawLevel = Number(row.distillLevel) || 0;
  const distillLevel = (rawLevel >= 0 && rawLevel <= 3 ? rawLevel : 0) as 0 | 1 | 2 | 3;
  return {
    id,
    title: ((row.title as string) || '').trim() || 'Sin título',
    contentPlain: (row.contentPlain as string) || '',
    noteType: (row.noteType as string) || 'fleeting',
    paraType: (row.paraType as string) || 'resource',
    linkCount: Number(row.linkCount) || 0,
    updatedAt: Number(row.updatedAt) || 0,
    isArchived: Boolean(row.isArchived),
    isFavorite: Boolean(row.isFavorite),
    deletedAt: Number(row.deletedAt) || 0,
    distillLevel,
  };
}
