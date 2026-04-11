import { create, type AnyOrama } from '@orama/orama';
import type { Row } from 'tinybase';

export const NOTES_SCHEMA = {
  id: 'string',
  title: 'string',
  contentPlain: 'string',
  noteType: 'string',
  paraType: 'string',
  linkCount: 'number',
  updatedAt: 'number',
  isArchived: 'boolean',
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
}

export function createNotesIndex(): AnyOrama {
  return create({ schema: NOTES_SCHEMA });
}

// Convierte una row de TinyBase al shape del schema Orama. TinyBase guarda
// arrays como JSON strings, booleanos pueden venir como undefined si la row
// fue creada parcialmente — normalizamos a defaults seguros.
export function rowToOramaDoc(id: string, row: Row): NoteOramaDoc {
  return {
    id,
    title: ((row.title as string) || '').trim() || 'Sin título',
    contentPlain: (row.contentPlain as string) || '',
    noteType: (row.noteType as string) || 'fleeting',
    paraType: (row.paraType as string) || 'resource',
    linkCount: Number(row.linkCount) || 0,
    updatedAt: Number(row.updatedAt) || 0,
    isArchived: Boolean(row.isArchived),
  };
}
