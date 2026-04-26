import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { wikilinkSuggestion } from '@/components/editor/extensions/wikilink-suggestion';

export interface WikilinkAttrs {
  noteId: string | null;
  noteTitle: string;
}

interface WikilinkOptions {
  noteId: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikilink: {
      insertWikilink: (attrs: WikilinkAttrs) => ReturnType;
    };
  }
}

// Node inline atómico. Attrs { noteId, noteTitle } para display sin fetch.
// El click se delega desde el wrapper del editor — aquí solo definimos
// parseHTML/renderHTML para serializar como <a data-note-id="..."> que el
// handler del wrapper intercepta. extractLinks lo parsea desde el JSON doc.
export const Wikilink = Node.create<WikilinkOptions>({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      noteId: '',
    };
  },

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-note-id'),
        renderHTML: (attrs: WikilinkAttrs) => {
          if (!attrs.noteId) return {};
          return { 'data-note-id': attrs.noteId };
        },
      },
      noteTitle: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-note-title') ?? element.textContent ?? '',
        renderHTML: (attrs: WikilinkAttrs) => {
          if (!attrs.noteTitle) return {};
          return { 'data-note-title': attrs.noteTitle };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-note-id]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const title = (node.attrs as WikilinkAttrs).noteTitle || 'Nota sin título';
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        class: 'wikilink',
        href: '#',
        'data-wikilink': 'true',
      }),
      title,
    ];
  },

  addCommands() {
    return {
      insertWikilink:
        (attrs: WikilinkAttrs) =>
        ({ chain }) =>
          chain().focus().insertContent({ type: this.name, attrs }).run(),
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...wikilinkSuggestion({ noteId: this.options.noteId }),
      }),
    ];
  },
});

export default Wikilink;
