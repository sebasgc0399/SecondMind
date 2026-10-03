import { useCallback, useRef } from 'react';
import { TextSelection } from '@tiptap/pm/state';
import { selectionToNoteDraft } from '@/components/editor/extensions/selection-to-note';
import { notesRepo } from '@/infra/repos/notesRepo';
import { syncLinksFromEditor } from '@/infra/syncLinksFromEditor';
import { extractLinks } from '@/lib/editor/extractLinks';
import { stringifyIds } from '@/lib/tinybase';
import useAuth from '@/hooks/useAuth';
import type { Editor } from '@tiptap/core';

export type ConvertSelectionResult = 'done' | 'error' | 'noop';

/**
 * Convierte la selección del editor en una nota nueva y la reemplaza por un wikilink
 * a ella (E2-T3).
 *
 * 1. Crea la nota vía `notesRepo.createNote` con el contenido seleccionado como JSON
 *    de TipTap. Si falla (`null`), NO toca la selección.
 * 2. Reemplaza el rango por un nodo `wikilink` normal (I4) en UNA sola transacción:
 *    Ctrl+Z restaura el texto original. El guardado normal de la nota actual crea el
 *    link y el backlink.
 * 3. Si el contenido movido trae wikilinks, sincroniza los links de la nota nueva
 *    (ella todavía no se abrió, así que nadie más los registraría).
 */
export async function convertSelectionToNote(
  editor: Editor,
  userId: string | null,
): Promise<ConvertSelectionResult> {
  if (editor.isDestroyed || !editor.isEditable) return 'noop';

  const startDoc = editor.state.doc;
  const { from, to } = editor.state.selection;
  const draft = selectionToNoteDraft(startDoc, from, to);
  if (!draft) return 'noop';

  const content = JSON.stringify(draft.contentJson);
  const newNoteId = await notesRepo.createNote({
    title: draft.title,
    contentPlain: draft.contentPlain,
    content,
  });
  if (!newNoteId) return 'error';

  // La creación es async: si el documento cambió mientras tanto, las posiciones ya no
  // son confiables. Solo se reemplaza si el rango sigue diciendo exactamente lo mismo.
  if (editor.isDestroyed) return 'error';
  if (!editor.state.doc.eq(startDoc)) {
    const current = selectionToNoteDraft(editor.state.doc, from, to);
    if (!current || JSON.stringify(current.contentJson) !== content) return 'error';
  }

  const wikilinkType = editor.schema.nodes.wikilink;
  if (!wikilinkType) return 'error';
  const wikilink = wikilinkType.create({ noteId: newNoteId, noteTitle: draft.title });

  editor
    .chain()
    .command(({ tr }) => {
      tr.replaceWith(from, to, wikilink);
      tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(to, 1))));
      return true;
    })
    .focus()
    .run();

  const newLinks = extractLinks(draft.contentJson);
  if (userId && newLinks.length > 0) {
    try {
      const { outgoingLinkIds, linkCount } = await syncLinksFromEditor({
        sourceId: newNoteId,
        sourceTitle: draft.title,
        userId,
        newLinks,
      });
      await notesRepo.updateMeta(newNoteId, {
        outgoingLinkIds: stringifyIds(outgoingLinkIds),
        linkCount,
      });
    } catch (error) {
      // La nota y el reemplazo ya están hechos; los links se reconcilian al guardar la nota.
      console.error('[convertSelectionToNote] syncLinks de la nota nueva falló', error);
    }
  }

  return 'done';
}

export default function useConvertSelectionToNote(
  editor: Editor | null,
  onResult?: (result: ConvertSelectionResult) => void,
) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const isBusyRef = useRef(false);

  return useCallback(async () => {
    if (!editor || isBusyRef.current) return;
    isBusyRef.current = true;
    try {
      onResult?.(await convertSelectionToNote(editor, uid));
    } catch (error) {
      console.error('[useConvertSelectionToNote] failed', error);
      onResult?.('error');
    } finally {
      isBusyRef.current = false;
    }
  }, [editor, uid, onResult]);
}
