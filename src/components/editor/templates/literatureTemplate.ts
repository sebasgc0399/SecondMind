import type { JSONContent } from '@tiptap/core';
import type { TFunction } from 'i18next';

// F2.7: materializa el JSONContent con t() AL INSERTAR (gate at-insert-time).
// El texto queda literal congelado en el documento — una nota creada en es
// conserva sus headings aunque luego se cambie el idioma. Localización MANUAL
// (este archivo está en el instrumentScorer→null del config); el `extract`
// igual recoge estas keys.
export function buildLiteratureTemplate(t: TFunction): JSONContent[] {
  return [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: t('editor.templates.literature.sourceHeading', 'Fuente') }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: t('editor.templates.literature.sourcePlaceholder', '[Autor, título, año, URL]'),
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [
        { type: 'text', text: t('editor.templates.literature.keyIdeasHeading', 'Ideas clave') },
      ],
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
      content: [
        {
          type: 'text',
          text: t('editor.templates.literature.inMyWordsHeading', 'En mis palabras'),
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: t(
            'editor.templates.literature.interpretationPlaceholder',
            '[Tu interpretación y conexiones]',
          ),
        },
      ],
    },
  ];
}
