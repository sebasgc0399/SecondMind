import { describe, expect, it } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import Wikilink from '@/components/editor/extensions/wikilink';
import {
  NOTE_TITLE_MAX_LENGTH,
  selectionToNoteDraft,
} from '@/components/editor/extensions/selection-to-note';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

const schema = getSchema([
  StarterKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit,
  Wikilink.configure({ noteId: 'current' }),
]);

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const p = (...content: JSONContent[]): JSONContent =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
const build = (...blocks: JSONContent[]): ProseMirrorNode =>
  schema.nodeFromJSON({ type: 'doc', content: blocks });

/** Posición del carácter `offset` de la primera aparición de `needle` en el documento. */
function posOf(doc: ProseMirrorNode, needle: string, offset = 0): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return;
    const index = node.text!.indexOf(needle);
    if (index >= 0) found = pos + index + offset;
  });
  if (found < 0) throw new Error(`no se encontró "${needle}"`);
  return found;
}
const rangeOf = (doc: ProseMirrorNode, needle: string): [number, number] => [
  posOf(doc, needle),
  posOf(doc, needle, needle.length),
];

describe('selectionToNoteDraft', () => {
  it('slice abierto dentro de un párrafo: queda un párrafo con solo lo seleccionado', () => {
    const doc = build(p(text('hola mundo cruel')));
    const [from, to] = rangeOf(doc, 'mundo');
    const draft = selectionToNoteDraft(doc, from, to)!;
    expect(draft.contentJson).toEqual({ type: 'doc', content: [p(text('mundo'))] });
    expect(draft.title).toBe('mundo');
    expect(draft.contentPlain).toBe('mundo');
  });

  it('multi-párrafo con bordes cortados a la mitad: conserva los bloques recortados', () => {
    const doc = build(p(text('uno dos')), p(text('tres')), p(text('cuatro cinco')));
    const draft = selectionToNoteDraft(doc, posOf(doc, 'dos'), posOf(doc, 'cuatro', 6))!;
    expect(draft.contentJson.content).toEqual([p(text('dos')), p(text('tres')), p(text('cuatro'))]);
    expect(draft.title).toBe('dos');
    expect(draft.contentPlain).toBe('dos\n\ntres\n\ncuatro');
  });

  it('selección dentro de un item de lista: conserva la lista', () => {
    const doc = build({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p(text('alfa beta'))] },
        { type: 'listItem', content: [p(text('gamma'))] },
      ],
    });
    const [from, to] = rangeOf(doc, 'beta');
    const draft = selectionToNoteDraft(doc, from, to)!;
    expect(draft.contentJson.content).toEqual([
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p(text('beta'))] }],
      },
    ]);
    expect(draft.title).toBe('beta');
  });

  it('selección que cruza varios items de lista: conserva los items', () => {
    const doc = build({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p(text('uno'))] },
        { type: 'listItem', content: [p(text('dos'))] },
        { type: 'listItem', content: [p(text('tres'))] },
      ],
    });
    const draft = selectionToNoteDraft(doc, posOf(doc, 'dos'), posOf(doc, 'tres', 4))!;
    const list = draft.contentJson.content![0]!;
    expect(list.type).toBe('bulletList');
    expect(list.content).toHaveLength(2);
    // getText separa bloques anidados con más saltos: paridad con el guardado normal.
    expect(draft.contentPlain).toMatch(/^dos\n+tres$/);
  });

  it('conserva formato (marcas) y wikilinks: el contenido no es solo texto plano', () => {
    const doc = build(
      p(
        text('ver '),
        text('esto', [{ type: 'bold' }]),
        text(' y '),
        { type: 'wikilink', attrs: { noteId: 'x1', noteTitle: 'Idea X' } },
        text(' fin'),
      ),
    );
    const draft = selectionToNoteDraft(doc, 1, doc.content.size - 1)!;
    const inline = draft.contentJson.content![0]!.content!;
    expect(inline).toContainEqual(text('esto', [{ type: 'bold' }]));
    expect(inline).toContainEqual({
      type: 'wikilink',
      attrs: { noteId: 'x1', noteTitle: 'Idea X' },
    });
    // contentPlain deriva igual que el guardado normal (getText): el wikilink no aporta texto.
    expect(draft.contentPlain).toBe('ver esto y  fin');
    expect(draft.title).toBe('ver esto y  fin');
  });

  it('selección que es solo un wikilink: el título sale de la nota enlazada', () => {
    const doc = build(
      p(text('a '), { type: 'wikilink', attrs: { noteId: 'x1', noteTitle: 'Idea X' } }),
    );
    const draft = selectionToNoteDraft(doc, posOf(doc, 'a ', 2), doc.content.size - 1)!;
    expect(draft.title).toBe('Idea X');
  });

  it('recorta el título a 80 caracteres', () => {
    const long = 'x'.repeat(200);
    const doc = build(p(text(long)));
    const draft = selectionToNoteDraft(doc, 1, 1 + long.length)!;
    expect(draft.title).toHaveLength(NOTE_TITLE_MAX_LENGTH);
    expect(NOTE_TITLE_MAX_LENGTH).toBe(80);
    // El contenido NO se recorta: solo el título.
    expect(draft.contentPlain).toHaveLength(200);
  });

  it('el recorte no parte un emoji ni deja espacio final', () => {
    const value = 'a'.repeat(79) + '😀 resto';
    const doc = build(p(text(value)));
    const draft = selectionToNoteDraft(doc, 1, 1 + value.length)!;
    expect(draft.title).toBe('a'.repeat(79) + '😀');
    const spaced = 'b'.repeat(79) + ' c';
    const doc2 = build(p(text(spaced)));
    expect(selectionToNoteDraft(doc2, 1, 1 + spaced.length)!.title).toBe('b'.repeat(79));
  });

  it('el título es la primera línea con texto, no el primer párrafo vacío', () => {
    const doc = build(p(), p(text('  segunda   ')), p(text('tercera')));
    const draft = selectionToNoteDraft(doc, 0, doc.content.size)!;
    expect(draft.title).toBe('segunda');
  });

  it('selección de toda la nota', () => {
    const doc = build(p(text('uno')), {
      type: 'heading',
      attrs: { level: 2 },
      content: [text('dos')],
    });
    const draft = selectionToNoteDraft(doc, 0, doc.content.size)!;
    expect(draft.contentJson).toEqual(doc.toJSON());
    expect(draft.title).toBe('uno');
  });

  it('selección que termina al inicio del bloque siguiente: no arrastra un párrafo vacío', () => {
    const doc = build(p(text('uno dos')), p(text('tres')));
    const draft = selectionToNoteDraft(doc, posOf(doc, 'dos'), posOf(doc, 'tres'))!;
    expect(draft.contentJson.content).toEqual([p(text('dos'))]);
  });

  it('texto dentro de una celda de tabla: párrafo, no una tabla de una celda', () => {
    const doc = build({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [{ type: 'tableCell', content: [p(text('celda uno'))] }],
        },
      ],
    });
    const [from, to] = rangeOf(doc, 'uno');
    const draft = selectionToNoteDraft(doc, from, to)!;
    expect(draft.contentJson.content).toEqual([p(text('uno'))]);
  });

  it('selección vacía o solo espacios: null', () => {
    const doc = build(p(text('hola   mundo')));
    expect(selectionToNoteDraft(doc, 3, 3)).toBeNull();
    expect(selectionToNoteDraft(doc, 6, 8)).toBeNull();
  });
});
