import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

// El doc de ProseMirror es inmutable: se recorre una vez por versión del doc.
const keyByDoc = new WeakMap<ProseMirrorNode, string>();

function collectWikilinkKey(doc: ProseMirrorNode): string {
  const cached = keyByDoc.get(doc);
  if (cached !== undefined) return cached;
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === 'wikilink') {
      const id = node.attrs.noteId as unknown;
      if (typeof id === 'string' && id) ids.add(id);
    }
  });
  const key = [...ids].sort().join('\n');
  keyByDoc.set(doc, key);
  return key;
}

/**
 * Ids de las notas enlazadas por nodos `wikilink` presentes ahora en el doc del
 * editor. Reactivo a cada cambio del doc (no espera al guardado debounced). Solo
 * re-renderiza cuando cambia el conjunto, no en cada tecla.
 */
export default function useEditorWikilinkIds(editor: Editor | null): ReadonlySet<string> {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!editor) return () => {};
      editor.on('update', onChange);
      return () => {
        editor.off('update', onChange);
      };
    },
    [editor],
  );
  const getSnapshot = useCallback(
    () => (editor && !editor.isDestroyed ? collectWikilinkKey(editor.state.doc) : ''),
    [editor],
  );
  const key = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => new Set(key ? key.split('\n') : []), [key]);
}
