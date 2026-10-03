import { getText, getTextSerializersFromSchema, type JSONContent } from '@tiptap/core';
import { AllSelection, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';

// Mismo límite y misma forma de recorte que el guardado normal (`useNoteSave`:
// `firstLine.slice(0, 200) || 'Sin título'`), así el título no cambia al primer guardado.
export const NOTE_TITLE_MAX_LENGTH = 200;
export const UNTITLED_NOTE_TITLE = 'Sin título';

export interface SelectionNoteDraft {
  title: string;
  contentJson: JSONContent;
  contentPlain: string;
}

function truncateTitle(text: string): string {
  // Unidades UTF-16 como `useNoteSave` (`slice`), sin `trimEnd` para no divergir. Única
  // diferencia: si el corte cae en medio de un emoji se descarta la mitad suelta.
  const sliced = text.slice(0, NOTE_TITLE_MAX_LENGTH);
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  if (sliced.length < text.length && lastCode >= 0xd800 && lastCode <= 0xdbff) {
    return sliced.slice(0, -1);
  }
  return sliced;
}

function isEmptyParagraph(node: JSONContent): boolean {
  return node.type === 'paragraph' && (!node.content || node.content.length === 0);
}

// Un slice que termina justo al inicio del bloque siguiente deja párrafos vacíos en los bordes.
function trimEmptyEdges(blocks: JSONContent[]): JSONContent[] {
  let start = 0;
  let end = blocks.length;
  while (start < end - 1 && isEmptyParagraph(blocks[start]!)) start += 1;
  while (end - 1 > start && isEmptyParagraph(blocks[end - 1]!)) end -= 1;
  return blocks.slice(start, end);
}

function hasWikilink(blocks: JSONContent[]): boolean {
  return blocks.some(
    (block) =>
      (block.type === 'wikilink' && Boolean(block.attrs?.noteId)) ||
      (Array.isArray(block.content) && hasWikilink(block.content)),
  );
}

function cellDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const role = $pos.node(depth).type.spec.tableRole as string | undefined;
    if (role === 'cell' || role === 'header_cell') return depth;
  }
  return -1;
}

/**
 * ¿La selección se puede convertir en nota? Solo texto (o toda la nota) no vacío que no
 * toque un bloque de código (el reemplazo uniría el código al párrafo) y que no cruce
 * celdas distintas de una tabla (el reemplazo borraría celdas). Una selección de nodo o
 * de celdas (`CellSelection`) no es convertible.
 */
export function canConvertSelection(state: EditorState): boolean {
  const { selection, doc } = state;
  if (selection.empty) return false;
  if (!(selection instanceof TextSelection) && !(selection instanceof AllSelection)) return false;

  let touchesCode = false;
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.type.spec.code) touchesCode = true;
    return !touchesCode;
  });
  if (touchesCode) return false;

  const fromCell = cellDepth(selection.$from);
  const toCell = cellDepth(selection.$to);
  if (fromCell < 0 && toCell < 0) return true;
  if (fromCell < 0 || toCell < 0) return false;
  return selection.$from.before(fromCell) === selection.$to.before(toCell);
}

function hasTableAncestor(doc: ProseMirrorNode, pos: number): boolean {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole) return true;
  }
  return false;
}

/**
 * Convierte la selección [from, to] del documento en el borrador de una nota nueva:
 * título (primera línea de texto, máx. 200 caracteres), contenido TipTap JSON (conserva
 * formato, listas y wikilinks) y texto plano derivado igual que en el guardado normal.
 *
 * - `slice(from, to, true)` incluye los padres, así un slice abierto (selección que
 *   corta párrafos o items a la mitad) queda como bloques válidos del documento.
 * - Si el slice no forma un documento válido (p. ej. filas de tabla sueltas), cae a un
 *   párrafo por línea de texto.
 * - Devuelve `null` si la selección no tiene nada convertible (vacía o solo espacios).
 */
export function selectionToNoteDraft(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): SelectionNoteDraft | null {
  if (from >= to) return null;

  const schema = doc.type.schema;
  const textSerializers = getTextSerializersFromSchema(schema);
  const toPlain = (node: ProseMirrorNode) =>
    getText(node, { blockSeparator: '\n\n', textSerializers });

  let docNode: ProseMirrorNode | null = null;
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);

  if ($from.sameParent($to) && $from.parent.isTextblock && hasTableAncestor(doc, from)) {
    // Texto dentro de una celda: un párrafo, no una tabla de una sola celda.
    const paragraph = schema.nodes.paragraph;
    if (paragraph) {
      docNode = doc.type.create(null, paragraph.create(null, doc.slice(from, to).content));
    }
  } else {
    const slice = doc.slice(from, to, true);
    try {
      const candidate = doc.type.create(null, slice.content);
      candidate.check();
      docNode = candidate;
    } catch {
      docNode = null;
    }
  }

  let blocks: JSONContent[];
  if (docNode) {
    blocks = trimEmptyEdges((docNode.toJSON() as JSONContent).content ?? []);
  } else {
    const lines = doc
      .textBetween(from, to, '\n', '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    blocks = lines.map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }));
  }

  const contentJson: JSONContent = { type: 'doc', content: blocks };
  const finalDoc = schema.nodeFromJSON(contentJson);
  // trim: getText antepone saltos de línea cuando el primer bloque está anidado (listas).
  const contentPlain = toPlain(finalDoc).trim();

  const firstLine = contentPlain
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine) return { title: truncateTitle(firstLine), contentJson, contentPlain };
  // Solo wikilinks (sin texto propio): el wikilink no aporta texto a getText, así que el
  // guardado normal titularía la nota 'Sin título'. Se usa ese mismo título desde el inicio.
  if (hasWikilink(blocks)) return { title: UNTITLED_NOTE_TITLE, contentJson, contentPlain };
  return null;
}
