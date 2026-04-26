import { PluginKey } from '@tiptap/pm/state';
import { notesStore } from '@/stores/notesStore';
import type { PopupListener } from '@/components/editor/hooks/useEditorPopup';
import type { Editor, Range } from '@tiptap/core';
import type { SuggestionOptions } from '@tiptap/suggestion';

export interface WikilinkSuggestionItem {
  id: string;
  title: string;
}

let activeListener: PopupListener<WikilinkSuggestionItem> | null = null;

export function setWikilinkMenuListener(
  listener: PopupListener<WikilinkSuggestionItem> | null,
): void {
  activeListener = listener;
}

export interface WikilinkSuggestionContext {
  noteId: string;
}

export function queryWikilinkItems(query: string, excludeId?: string): WikilinkSuggestionItem[] {
  const table = notesStore.getTable('notes');
  const queryLower = query.trim().toLowerCase();
  const rows = Object.entries(table).map(([id, row]) => ({
    id,
    title: ((row.title as string) || '').trim() || 'Sin título',
    updatedAt: (row.updatedAt as number) || 0,
    isArchived: Boolean(row.isArchived),
    deletedAt: Number(row.deletedAt) || 0,
  }));

  return rows
    .filter((row) => !row.isArchived && row.deletedAt === 0)
    .filter((row) => !excludeId || row.id !== excludeId)
    .filter((row) => queryLower === '' || row.title.toLowerCase().includes(queryLower))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)
    .map(({ id, title }) => ({ id, title }));
}

const ALPHANUMERIC = /[a-zA-Z0-9]/;

export const wikilinkSuggestionPluginKey = new PluginKey('wikilink-suggestion');

export function wikilinkSuggestion(
  context: WikilinkSuggestionContext,
): Omit<SuggestionOptions<WikilinkSuggestionItem>, 'editor'> {
  return {
    pluginKey: wikilinkSuggestionPluginKey,
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

    items: ({ query }) => queryWikilinkItems(query, context.noteId),

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
}
