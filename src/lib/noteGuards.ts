// Guards de "nota viva" para las VISTAS. La infraestructura (sync, repos, export,
// tab Papelera) no filtra con esto (SPEC-70 I3).

interface NoteRowLike {
  deletedAt?: unknown;
}

// Una nota está en la papelera si su deletedAt es un número > 0 (soft-delete).
// undefined, 0 o cualquier valor no numérico cuentan como "no borrada".
export function isTrashedNote(row: NoteRowLike | null | undefined): boolean {
  return typeof row?.deletedAt === 'number' && row.deletedAt > 0;
}

export function isLiveNote(row: NoteRowLike | null | undefined): boolean {
  return !isTrashedNote(row);
}
