import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

// Lógica pura del placeholder del editor (SPEC-71 T1). Se separa de NoteEditor
// para testearla sin montar TipTap: la extensión Placeholder solo llama a esta
// función con el nodo vacío bajo el cursor.

export interface PlaceholderTexts {
  /** Nota completamente vacía. */
  emptyDoc: string;
  /** Párrafo vacío (con el cursor) en una nota que ya tiene contenido. */
  emptyLine: string;
}

export interface ResolvePlaceholderArgs {
  node: ProseMirrorNode;
  /** Posición de inicio del nodo (la que entrega Placeholder como `pos`). */
  pos: number;
  doc: ProseMirrorNode;
  isEmptyDoc: boolean;
  texts: PlaceholderTexts;
}

export function resolvePlaceholderText({
  node,
  pos,
  doc,
  isEmptyDoc,
  texts,
}: ResolvePlaceholderArgs): string {
  // Nota vacía: el texto de "idea" solo va en el primer bloque; las demás líneas
  // vacías caen en la regla de párrafo de primer nivel.
  if (isEmptyDoc && pos === 0) return texts.emptyDoc;
  // Solo párrafos de primer nivel: nunca dentro de bloques de código, tablas,
  // items de tarea, listas o citas, ni en headings vacíos.
  if (node.type.name !== 'paragraph') return '';
  if (doc.resolve(pos).parent.type.name !== 'doc') return '';
  return texts.emptyLine;
}
