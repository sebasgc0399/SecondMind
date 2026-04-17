import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { slashCommandSuggestion } from '@/components/editor/extensions/slash-command-suggestion';

interface SlashCommandOptions {
  noteId: string;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { noteId: '' };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...slashCommandSuggestion({ noteId: this.options.noteId }),
      }),
    ];
  },
});

export default SlashCommand;
