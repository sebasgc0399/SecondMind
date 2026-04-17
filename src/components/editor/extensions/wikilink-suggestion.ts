import type { Editor, Range } from '@tiptap/core';
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from '@tiptap/suggestion';
import { notesStore } from '@/stores/notesStore';

export interface WikilinkSuggestionItem {
  id: string;
  title: string;
}

// Listener global para el render del Suggestion plugin. El plugin se crea
// una sola vez en la inicialización del editor — no podemos pasarle React
// state directamente. El WikilinkMenu monta/desmonta un listener en esta
// variable módulo-level. Asume un solo editor activo a la vez (OK para MVP).
export interface WikilinkMenuListener {
  onStart: (props: SuggestionProps<WikilinkSuggestionItem>) => void;
  onUpdate: (props: SuggestionProps<WikilinkSuggestionItem>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
}

let activeListener: WikilinkMenuListener | null = null;

export function setWikilinkMenuListener(listener: WikilinkMenuListener | null): void {
  activeListener = listener;
}

function queryItems(query: string): WikilinkSuggestionItem[] {
  const table = notesStore.getTable('notes');
  const queryLower = query.trim().toLowerCase();
  const rows = Object.entries(table).map(([id, row]) => ({
    id,
    title: ((row.title as string) || '').trim() || 'Sin título',
    updatedAt: (row.updatedAt as number) || 0,
    isArchived: Boolean(row.isArchived),
  }));

  return rows
    .filter((row) => !row.isArchived)
    .filter((row) => queryLower === '' || row.title.toLowerCase().includes(queryLower))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)
    .map(({ id, title }) => ({ id, title }));
}

const ALPHANUMERIC = /[a-zA-Z0-9]/;

export const wikilinkSuggestion: Omit<SuggestionOptions<WikilinkSuggestionItem>, 'editor'> = {
  char: '@',
  allowSpaces: true,
  startOfLine: false,
  allowedPrefixes: null,

  allow: ({ state, range }) => {
    if (range.from === 0) return true;
    const prevChar = state.doc.textBetween(range.from - 1, range.from, undefined, '\n');
    if (!prevChar) return true;
    return !ALPHANUMERIC.test(prevChar);
  },

  items: ({ query }) => queryItems(query),

  command: ({
    editor,
    range,
    props,
  }: {
    editor: Editor;
    range: Range;
    props: WikilinkSuggestionItem;
  }) => {
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        { type: 'wikilink', attrs: { noteId: props.id, noteTitle: props.title } },
        { type: 'text', text: ' ' },
      ])
      .run();
  },

  render: () => ({
    onStart: (props) => activeListener?.onStart(props),
    onUpdate: (props) => activeListener?.onUpdate(props),
    onKeyDown: (props) => activeListener?.onKeyDown(props) ?? false,
    onExit: () => activeListener?.onExit(),
  }),
};
