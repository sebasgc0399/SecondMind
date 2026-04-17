import { PluginKey } from '@tiptap/pm/state';
import {
  filterSlashMenuItems,
  type SlashCommandContext,
  type SlashMenuItem,
} from '@/components/editor/menus/slashMenuItems';
import type { Editor, Range } from '@tiptap/core';
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from '@tiptap/suggestion';

export const slashCommandPluginKey = new PluginKey('slash-command-suggestion');

export interface SlashMenuListener {
  onStart: (props: SuggestionProps<SlashMenuItem>) => void;
  onUpdate: (props: SuggestionProps<SlashMenuItem>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
}

let activeListener: SlashMenuListener | null = null;

export function setSlashMenuListener(listener: SlashMenuListener | null): void {
  activeListener = listener;
}

const ALPHANUMERIC = /[a-zA-Z0-9]/;

export function slashCommandSuggestion(
  context: SlashCommandContext,
): Omit<SuggestionOptions<SlashMenuItem>, 'editor'> {
  return {
    pluginKey: slashCommandPluginKey,
    char: '/',
    allowSpaces: false,
    startOfLine: false,
    allowedPrefixes: null,

    allow: ({ state, range }) => {
      if (range.from === 0) return true;
      const prevChar = state.doc.textBetween(range.from - 1, range.from, undefined, '\n');
      if (!prevChar) return true;
      return !ALPHANUMERIC.test(prevChar);
    },

    items: ({ query }) => filterSlashMenuItems(query),

    command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashMenuItem }) => {
      editor.chain().focus().deleteRange(range).run();
      props.action(editor, context);
    },

    render: () => ({
      onStart: (props) => activeListener?.onStart(props),
      onUpdate: (props) => activeListener?.onUpdate(props),
      onKeyDown: (props) => activeListener?.onKeyDown(props) ?? false,
      onExit: () => activeListener?.onExit(),
    }),
  };
}
