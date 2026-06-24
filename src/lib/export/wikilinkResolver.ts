// Resolución de wikilinks para el export Markdown (D3, SPEC-67).
//
// El nodo `wikilink` del editor guarda { noteId, noteTitle }, pero el noteTitle
// se CONGELA al insertar y NO se refresca en rename (verificado: cero callers de
// propagación). Por eso el export resuelve el título FRESCO por noteId contra el
// set de notas exportables, nunca confía en attrs.noteTitle.
//
// Casos (D3):
//  - noteId resuelve a una nota exportable → `[[Título]]` (o `[[basename|Título]]`
//    si el nombre de archivo difiere del título, p. ej. por sanitización/colisión).
//  - noteId dangling (papelera/archivado-excluido/inexistente) → texto plano MARCADO
//    `\[\[Título\]\]` (corchetes literales: se lee como link roto, no navega).
//  - noteId null (suggestion nunca resuelta) → texto plano.

import { buildFilenameMap, type ExportNoteRef } from './filenames';

export type WikilinkResolver = (noteId: string | null | undefined, staleDisplay: string) => string;

// Escapa los corchetes/pipe para emitir texto plano que NO se interprete como link.
function escapeBrackets(text: string): string {
  return text.replace(/([[\]|])/g, '\\$1');
}

export function buildWikilinkResolver(notes: ExportNoteRef[]): WikilinkResolver {
  const filenameMap = buildFilenameMap(notes);
  const titleMap = new Map(notes.map((n) => [n.id, (n.title ?? '').trim()]));

  return (noteId, staleDisplay) => {
    const fallback = (staleDisplay ?? '').trim();

    // Suggestion sin id real → texto plano (lo mejor que tenemos es el display).
    if (!noteId) return escapeBrackets(fallback) || '[ ]';

    const basename = filenameMap.get(noteId);

    // Dangling: el target no está en el set exportable.
    if (!basename) {
      const display = titleMap.get(noteId) || fallback || 'nota';
      return `\\[\\[${escapeBrackets(display)}\\]\\]`;
    }

    const freshTitle = titleMap.get(noteId) || fallback || basename;
    return basename === freshTitle ? `[[${freshTitle}]]` : `[[${basename}|${freshTitle}]]`;
  };
}
