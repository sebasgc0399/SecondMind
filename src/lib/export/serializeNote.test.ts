import { describe, it, expect } from 'vitest';
import { serializeNoteContent } from './serializeNote';
import { buildWikilinkResolver } from './wikilinkResolver';
import type { JSONContent } from '@tiptap/core';

const resolver = buildWikilinkResolver([
  { id: 'n-alpha', title: 'Nota Alpha' },
  { id: 'n-beta', title: 'Beta: con / chars' },
]);

function doc(...content: JSONContent[]): JSONContent {
  return { type: 'doc', content };
}
function p(...content: JSONContent[]): JSONContent {
  return { type: 'paragraph', content };
}
function txt(text: string, marks?: JSONContent['marks']): JSONContent {
  return marks ? { type: 'text', text, marks } : { type: 'text', text };
}
function md(content: JSONContent): string {
  return serializeNoteContent(content, resolver).trim();
}

describe('serializeNoteContent — nodos/marks estándar (default GFM)', () => {
  it('heading', () => {
    expect(md(doc({ type: 'heading', attrs: { level: 2 }, content: [txt('Título H2')] }))).toBe(
      '## Título H2',
    );
  });

  it('marks estándar y distill (bold=L1, highlight==L2)', () => {
    const out = md(
      doc(
        p(
          txt('negrita', [{ type: 'bold' }]),
          txt(' '),
          txt('itálica', [{ type: 'italic' }]),
          txt(' '),
          txt('código', [{ type: 'code' }]),
          txt(' '),
          txt('tachado', [{ type: 'strike' }]),
          txt(' '),
          txt('resaltado', [{ type: 'highlight' }]),
        ),
      ),
    );
    expect(out).toContain('**negrita**'); // distill L1
    expect(out).toContain('_itálica_');
    expect(out).toContain('`código`');
    expect(out).toContain('~~tachado~~'); // GFM strikethrough
    expect(out).toContain('==resaltado=='); // distill L2
  });

  it('link, listas, blockquote, hr', () => {
    expect(md(doc(p(txt('enlace', [{ type: 'link', attrs: { href: 'https://x.com' } }]))))).toBe(
      '[enlace](https://x.com)',
    );
    expect(
      md(
        doc({
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [p(txt('uno'))] },
            { type: 'listItem', content: [p(txt('dos'))] },
          ],
        }),
      ),
    ).toBe('- uno\n- dos');
    expect(md(doc({ type: 'blockquote', content: [p(txt('cita'))] }))).toBe('> cita');
  });
});

describe('serializeNoteContent — overrides GFM (F2)', () => {
  it('codeBlock con lenguaje → fence con info-string', () => {
    expect(
      md(
        doc({
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [txt('const x = 1;')],
        }),
      ),
    ).toBe('```typescript\nconst x = 1;\n```');
  });

  it('codeBlock con language=null → fence pelado (NO ```null)', () => {
    expect(md(doc({ type: 'codeBlock', attrs: { language: null }, content: [txt('plain')] }))).toBe(
      '```\nplain\n```',
    );
  });

  it('codeBlock no escapa markdown del contenido', () => {
    const out = md(
      doc({ type: 'codeBlock', attrs: { language: 'md' }, content: [txt('a *b* _c_')] }),
    );
    expect(out).toBe('```md\na *b* _c_\n```');
  });

  it('taskList → GFM checklist con attrs.checked', () => {
    expect(
      md(
        doc({
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: true }, content: [p(txt('hecho'))] },
            { type: 'taskItem', attrs: { checked: false }, content: [p(txt('pendiente'))] },
          ],
        }),
      ),
    ).toBe('- [x] hecho\n- [ ] pendiente');
  });

  it('tabla GFM con pipes escapados en celdas', () => {
    expect(
      md(
        doc({
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [p(txt('Col A'))] },
                { type: 'tableHeader', content: [p(txt('Col B'))] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [p(txt('a1'))] },
                { type: 'tableCell', content: [p(txt('b1 | con pipe'))] },
              ],
            },
          ],
        }),
      ),
    ).toBe('| Col A | Col B |\n| --- | --- |\n| a1 | b1 \\| con pipe |');
  });
});

describe('serializeNoteContent — wikilinks (D3 fresh-resolve)', () => {
  it('válido → [[Título fresco]], ignora el noteTitle congelado', () => {
    expect(
      md(
        doc(p({ type: 'wikilink', attrs: { noteId: 'n-alpha', noteTitle: 'titulo viejo stale' } })),
      ),
    ).toBe('[[Nota Alpha]]');
  });

  it('basename != título (sanitización/colisión) → [[basename|Título]]', () => {
    expect(md(doc(p({ type: 'wikilink', attrs: { noteId: 'n-beta', noteTitle: 'Beta' } })))).toBe(
      '[[Beta con chars|Beta: con / chars]]',
    );
  });

  it('dangling (noteId fuera del set exportable) → texto plano marcado', () => {
    expect(
      md(doc(p({ type: 'wikilink', attrs: { noteId: 'n-missing', noteTitle: 'Borrada' } }))),
    ).toBe('\\[\\[Borrada\\]\\]');
  });

  it('noteId null (suggestion sin resolver) → texto plano', () => {
    expect(
      md(doc(p({ type: 'wikilink', attrs: { noteId: null, noteTitle: 'sin resolver' } }))),
    ).toBe('sin resolver');
  });
});

describe('serializeNoteContent — espaciado entre bloques', () => {
  it('separa todos los bloques con línea en blanco (\\n\\n)', () => {
    const out = md(
      doc(
        p(txt('antes')),
        { type: 'codeBlock', attrs: { language: 'js' }, content: [txt('const a = 1;')] },
        {
          type: 'taskList',
          content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(txt('tarea'))] }],
        },
        p(txt('después')),
      ),
    );
    expect(out).toBe('antes\n\n```js\nconst a = 1;\n```\n\n- [ ] tarea\n\ndespués');
  });
});
