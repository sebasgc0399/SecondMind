import type { JSONContent } from '@tiptap/core';

export const literatureTemplate: JSONContent[] = [
  {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: 'Fuente' }],
  },
  {
    type: 'paragraph',
    content: [{ type: 'text', text: '[Autor, título, año, URL]' }],
  },
  {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: 'Ideas clave' }],
  },
  {
    type: 'bulletList',
    content: [
      { type: 'listItem', content: [{ type: 'paragraph' }] },
      { type: 'listItem', content: [{ type: 'paragraph' }] },
      { type: 'listItem', content: [{ type: 'paragraph' }] },
    ],
  },
  {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: 'En mis palabras' }],
  },
  {
    type: 'paragraph',
    content: [{ type: 'text', text: '[Tu interpretación y conexiones]' }],
  },
];
