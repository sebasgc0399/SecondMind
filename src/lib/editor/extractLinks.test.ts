import { describe, expect, it } from 'vitest';
import { extractLinks } from './extractLinks';
import type { JSONContent } from '@tiptap/core';

describe('extractLinks', () => {
  it('extrae un wikilink en un párrafo de nivel raíz', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Relacionado con ' },
            { type: 'wikilink', attrs: { noteId: 'n1', noteTitle: 'Nota uno' } },
          ],
        },
      ],
    };
    const links = extractLinks(doc);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ targetId: 'n1', targetTitle: 'Nota uno' });
    expect(links[0]?.context).toContain('Relacionado con');
    expect(links[0]?.context).toContain('Nota uno');
  });

  // D4 (F60): un wikilink dentro de una celda de tabla debe extraerse igual que
  // en cualquier otro bloque. El walker de extractLinks es recursivo genérico,
  // así recorre table > tableRow > tableCell > paragraph > wikilink sin código
  // específico de tablas. Este test es el guardrail de esa garantía.
  it('extrae un wikilink dentro de una celda de tabla', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        { type: 'text', text: 'Ver ' },
                        { type: 'wikilink', attrs: { noteId: 'n2', noteTitle: 'Otra nota' } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const links = extractLinks(doc);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ targetId: 'n2', targetTitle: 'Otra nota' });
    // El contexto es el texto del párrafo de la celda (bloque no-inline más cercano).
    expect(links[0]?.context).toContain('Ver');
    expect(links[0]?.context).toContain('Otra nota');
  });

  it('ignora wikilinks sin noteId', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'wikilink', attrs: { noteId: null, noteTitle: '' } }],
        },
      ],
    };
    expect(extractLinks(doc)).toHaveLength(0);
  });
});
