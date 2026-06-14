import type { JSONContent } from '@tiptap/core';
import type { TFunction } from 'i18next';

// F2.7: materializa el JSONContent con t() AL INSERTAR (gate at-insert-time).
// Texto literal congelado en el documento; ver buildLiteratureTemplate.
export function buildPermanentTemplate(t: TFunction): JSONContent[] {
  return [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: t('editor.templates.permanent.thesisHeading', 'Tesis') }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: t(
            'editor.templates.permanent.thesisPlaceholder',
            '[La idea central en una oración]',
          ),
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [
        { type: 'text', text: t('editor.templates.permanent.developmentHeading', 'Desarrollo') },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: t(
            'editor.templates.permanent.developmentPlaceholder',
            '[Argumentación, evidencia, ejemplos]',
          ),
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [
        { type: 'text', text: t('editor.templates.permanent.connectionsHeading', 'Conexiones') },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: t(
            'editor.templates.permanent.connectionsPlaceholder',
            '[Notas relacionadas — usa @ para mencionar]',
          ),
        },
      ],
    },
  ];
}
