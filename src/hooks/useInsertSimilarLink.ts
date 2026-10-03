import { useCallback, useEffect, useRef } from 'react';
import type { WikilinkAttrs } from '@/components/editor/extensions/wikilink';
import type { Editor } from '@tiptap/core';

/**
 * Inserta un wikilink en el editor. Si el editor ya tuvo foco, va en la posición
 * del cursor (tras el final de la selección, sin reemplazar texto); si nunca lo
 * tuvo, al final del documento. Es un nodo `wikilink` normal (I4): el guardado
 * normal crea link y backlink.
 */
export function insertSimilarWikilink(
  editor: Editor,
  attrs: WikilinkAttrs,
  hasBeenFocused: boolean,
): void {
  const chain = editor.chain();
  if (hasBeenFocused) {
    chain.setTextSelection(editor.state.selection.to);
  } else {
    chain.focus('end');
  }
  chain.insertWikilink(attrs).run();
}

export default function useInsertSimilarLink(editor: Editor | null) {
  const hasBeenFocusedRef = useRef(false);

  useEffect(() => {
    hasBeenFocusedRef.current = false;
    if (!editor) return;
    const handleFocus = () => {
      hasBeenFocusedRef.current = true;
    };
    editor.on('focus', handleFocus);
    return () => {
      editor.off('focus', handleFocus);
    };
  }, [editor]);

  return useCallback(
    (targetNoteId: string, targetTitle: string) => {
      if (!editor || editor.isDestroyed) return;
      insertSimilarWikilink(
        editor,
        { noteId: targetNoteId, noteTitle: targetTitle },
        hasBeenFocusedRef.current,
      );
    },
    [editor],
  );
}
