import Placeholder from '@tiptap/extension-placeholder';
import {
  resolvePlaceholderText,
  type PlaceholderTexts,
} from '@/components/editor/extensions/placeholder-text';

// Config de Placeholder compartida entre NoteEditor y su test de integración.
export function createPlaceholderExtension(texts: PlaceholderTexts) {
  return Placeholder.configure({
    placeholder: ({ editor, node, pos }) =>
      resolvePlaceholderText({
        node,
        pos,
        doc: editor.state.doc,
        isEmptyDoc: editor.isEmpty,
        texts,
      }),
  });
}
