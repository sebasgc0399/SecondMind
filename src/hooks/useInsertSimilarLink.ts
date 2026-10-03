import { useCallback } from 'react';
import { hasEditorBeenFocused } from '@/components/editor/extensions/focus-tracking';
import type { WikilinkAttrs } from '@/components/editor/extensions/wikilink';
import type { Editor } from '@tiptap/core';

/**
 * Inserta un wikilink en el editor. Si el editor ya tuvo foco, va en la posición
 * del cursor (tras el final de la selección, sin reemplazar texto); si nunca lo
 * tuvo, al final del documento. Si el cursor está en un bloque que no admite el
 * nodo (bloque de código), va en un párrafo nuevo justo después de ese bloque
 * (E2-T2-e). Es un nodo `wikilink` normal (I4): el guardado normal crea link y
 * backlink.
 */
export function insertSimilarWikilink(
  editor: Editor,
  attrs: WikilinkAttrs,
  hasBeenFocused: boolean,
): void {
  if (!hasBeenFocused) {
    editor.chain().focus('end').insertWikilink(attrs).run();
    return;
  }

  const { state } = editor;
  const wikilinkType = state.schema.nodes.wikilink;
  const $pos = state.doc.resolve(state.selection.to);
  const parent = $pos.parent;
  const acceptsWikilink =
    wikilinkType !== undefined &&
    !parent.type.spec.code &&
    parent.canReplaceWith($pos.index(), $pos.index(), wikilinkType);

  if (acceptsWikilink) {
    editor.chain().setTextSelection(state.selection.to).insertWikilink(attrs).run();
    return;
  }

  if ($pos.depth > 0) {
    editor
      .chain()
      .focus()
      .insertContentAt($pos.after(), {
        type: 'paragraph',
        content: [{ type: 'wikilink', attrs }],
      })
      .run();
    return;
  }

  editor.chain().focus('end').insertWikilink(attrs).run();
}

export default function useInsertSimilarLink(editor: Editor | null) {
  return useCallback(
    (targetNoteId: string, targetTitle: string) => {
      if (!editor || editor.isDestroyed) return;
      insertSimilarWikilink(
        editor,
        { noteId: targetNoteId, noteTitle: targetTitle },
        hasEditorBeenFocused(editor),
      );
    },
    [editor],
  );
}
