import type { JSONContent } from '@tiptap/core';

export const permanentTemplate: JSONContent[] = [
  {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: 'Tesis' }],
  },
  {
    type: 'paragraph',
    content: [{ type: 'text', text: '[La idea central en una oración]' }],
  },
  {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: 'Desarrollo' }],
  },
  {
    type: 'paragraph',
    content: [{ type: 'text', text: '[Argumentación, evidencia, ejemplos]' }],
  },
  {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: 'Conexiones' }],
  },
  {
    type: 'paragraph',
    content: [{ type: 'text', text: '[Notas relacionadas — usa @ para mencionar]' }],
  },
];
