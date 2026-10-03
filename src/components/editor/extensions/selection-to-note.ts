import { getText, getTextSerializersFromSchema, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export const NOTE_TITLE_MAX_LENGTH = 80;

export interface SelectionNoteDraft {
  title: string;
  contentJson: JSONContent;
  contentPlain: string;
}

function truncateTitle(text: string): string {
  // Array.from respeta pares sustitutos: no corta un emoji a la mitad.
  const chars = Array.from(text);
  if (chars.length <= NOTE_TITLE_MAX_LENGTH) return text;
  return chars.slice(0, NOTE_TITLE_MAX_LENGTH).join('').trimEnd();
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

function firstWikilinkTitle(blocks: JSONContent[]): string {
  for (const block of blocks) {
    if (block.type === 'wikilink') {
      const title = (block.attrs?.noteTitle as string | undefined)?.trim();
      if (title) return title;
    }
    if (Array.isArray(block.content)) {
      const nested = firstWikilinkTitle(block.content);
      if (nested) return nested;
    }
  }
  return '';
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
 * título (primera línea de texto, máx. 80 caracteres), contenido TipTap JSON (conserva
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
  const rawTitle = firstLine ?? firstWikilinkTitle(blocks);
  if (!rawTitle) return null;

  return { title: truncateTitle(rawTitle), contentJson, contentPlain };
}
