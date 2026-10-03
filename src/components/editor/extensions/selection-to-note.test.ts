import { describe, expect, it } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import { AllSelection, EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import Wikilink from '@/components/editor/extensions/wikilink';
import {
  NOTE_TITLE_MAX_LENGTH,
  UNTITLED_NOTE_TITLE,
  canConvertSelection,
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

  it('selección que es solo un wikilink: título "Sin título", igual que el guardado normal', () => {
    const doc = build(
      p(text('a '), { type: 'wikilink', attrs: { noteId: 'x1', noteTitle: 'Idea X' } }),
    );
    const draft = selectionToNoteDraft(doc, posOf(doc, 'a ', 2), doc.content.size - 1)!;
    // El wikilink no aporta texto: useNoteSave calcularía `'' || 'Sin título'`.
    expect(draft.contentPlain).toBe('');
    expect(draft.title).toBe(UNTITLED_NOTE_TITLE);
    expect(UNTITLED_NOTE_TITLE).toBe('Sin título');
  });

  it('recorta el título a 200 caracteres', () => {
    const long = 'x'.repeat(300);
    const doc = build(p(text(long)));
    const draft = selectionToNoteDraft(doc, 1, 1 + long.length)!;
    expect(draft.title).toHaveLength(NOTE_TITLE_MAX_LENGTH);
    expect(NOTE_TITLE_MAX_LENGTH).toBe(200);
    // El contenido NO se recorta: solo el título.
    expect(draft.contentPlain).toHaveLength(300);
  });

  it('el título coincide con el que calcula useNoteSave (firstLine.slice(0, 200))', () => {
    // Fórmula de useNoteSave.save: primera línea de getText, trim, slice(0, 200).
    const saveTitle = (plain: string) =>
      (plain.split('\n', 1)[0]?.trim() ?? '').slice(0, 200) || 'Sin título';
    for (const value of ['  corto  ', 'b'.repeat(199) + ' c', 'palabra '.repeat(40)]) {
      const doc = build(p(text(value)), p(text('segunda línea')));
      const draft = selectionToNoteDraft(doc, 0, doc.content.size)!;
      expect(draft.title).toBe(saveTitle(draft.contentPlain));
    }
  });

  it('el recorte no parte un emoji a la mitad', () => {
    const value = 'a'.repeat(199) + '😀 resto';
    const doc = build(p(text(value)));
    const draft = selectionToNoteDraft(doc, 1, 1 + value.length)!;
    expect(draft.title).toBe('a'.repeat(199));
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

describe('canConvertSelection (visibilidad del botón)', () => {
  const cell = (value: string): JSONContent => ({ type: 'tableCell', content: [p(text(value))] });
  const table = (...rows: JSONContent[][]): JSONContent => ({
    type: 'table',
    content: rows.map((cells) => ({ type: 'tableRow', content: cells })),
  });
  const code = (value: string): JSONContent => ({ type: 'codeBlock', content: [text(value)] });
  const withText = (doc: ProseMirrorNode, from: number, to: number) =>
    EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });

  it('texto dentro de un párrafo: visible', () => {
    const doc = build(p(text('hola mundo')));
    const [from, to] = rangeOf(doc, 'mundo');
    expect(canConvertSelection(withText(doc, from, to))).toBe(true);
  });

  it('selección vacía: oculto', () => {
    const doc = build(p(text('hola')));
    expect(canConvertSelection(withText(doc, 2, 2))).toBe(false);
  });

  it('párrafo hasta la mitad de un bloque de código: oculto', () => {
    const doc = build(p(text('texto normal')), code('const x = 1;'));
    expect(canConvertSelection(withText(doc, posOf(doc, 'normal'), posOf(doc, 'const', 5)))).toBe(
      false,
    );
  });

  it('párrafos que envuelven un bloque de código entero: oculto', () => {
    const doc = build(p(text('antes')), code('x'), p(text('después')));
    expect(canConvertSelection(withText(doc, posOf(doc, 'antes'), posOf(doc, 'después', 3)))).toBe(
      false,
    );
  });

  it('dentro de una misma celda: visible', () => {
    const doc = build(table([cell('alfa uno'), cell('beta dos')]));
    const [from, to] = rangeOf(doc, 'uno');
    expect(canConvertSelection(withText(doc, from, to))).toBe(true);
  });

  it('entre dos celdas de la misma fila: oculto', () => {
    const doc = build(table([cell('alfa uno'), cell('beta dos')]), p(text('después')));
    expect(canConvertSelection(withText(doc, posOf(doc, 'uno'), posOf(doc, 'beta', 4)))).toBe(
      false,
    );
  });

  it('entre celdas de filas distintas: oculto', () => {
    const doc = build(table([cell('a1'), cell('b1')], [cell('a2'), cell('b2')]));
    expect(canConvertSelection(withText(doc, posOf(doc, 'b1'), posOf(doc, 'a2', 2)))).toBe(false);
  });

  it('desde una celda hasta el párrafo de después: oculto', () => {
    const doc = build(
      p(text('antes')),
      table([cell('alfa uno'), cell('beta dos')]),
      p(text('después fin')),
    );
    expect(canConvertSelection(withText(doc, posOf(doc, 'uno'), posOf(doc, 'después', 7)))).toBe(
      false,
    );
  });

  it('selección de nodo y de celdas: oculto', () => {
    const doc = build(p(text('uno')), table([cell('a1'), cell('b1')]));
    const tablePos = doc.child(0).nodeSize;
    const nodeState = EditorState.create({ doc, selection: NodeSelection.create(doc, tablePos) });
    expect(canConvertSelection(nodeState)).toBe(false);

    const firstCell = doc.resolve(tablePos + 2);
    const secondCell = doc.resolve(tablePos + 2 + doc.child(1).child(0).child(0).nodeSize);
    const cellState = EditorState.create({
      doc,
      selection: new CellSelection(firstCell, secondCell),
    });
    expect(canConvertSelection(cellState)).toBe(false);
  });

  it('toda la nota (AllSelection) sin código: visible; con código: oculto', () => {
    const plain = build(p(text('uno')), p(text('dos')));
    expect(
      canConvertSelection(EditorState.create({ doc: plain, selection: new AllSelection(plain) })),
    ).toBe(true);
    const withCode = build(p(text('uno')), code('x'));
    expect(
      canConvertSelection(
        EditorState.create({ doc: withCode, selection: new AllSelection(withCode) }),
      ),
    ).toBe(false);
  });
});
