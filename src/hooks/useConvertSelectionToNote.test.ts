// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Wikilink from '@/components/editor/extensions/wikilink';
import { convertSelectionToNote } from '@/hooks/useConvertSelectionToNote';

// Editor TipTap real; repo y sync de links mockeados (I3: la escritura pasa por el repo).

const createNoteMock = vi.fn<(overrides?: Record<string, unknown>) => Promise<string | null>>();
const updateMetaMock = vi.fn();
const syncLinksMock = vi.fn();

vi.mock('@/infra/repos/notesRepo', () => ({
  notesRepo: {
    createNote: (...args: [Record<string, unknown>?]) => createNoteMock(...args),
    updateMeta: (...args: unknown[]) => updateMetaMock(...args),
  },
}));
vi.mock('@/infra/syncLinksFromEditor', () => ({
  syncLinksFromEditor: (...args: unknown[]) => syncLinksMock(...args),
}));
vi.mock('@/hooks/useAuth', () => ({ default: () => ({ user: { uid: 'u1' } }) }));

beforeAll(() => {
  // jsdom no implementa estas APIs de layout que ProseMirror consulta (focus() hace scrollIntoView).
  (Text.prototype as unknown as { getClientRects: () => unknown[] }).getClientRects = () => [];
  document.elementFromPoint = () => null;
  Range.prototype.getClientRects = (() => []) as unknown as Range['getClientRects'];
  Range.prototype.getBoundingClientRect = (() => ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  })) as unknown as Range['getBoundingClientRect'];
});

// Sin afterAll que restaure: tiptap hace scrollIntoView en requestAnimationFrame (después del test)
// y cada archivo corre en su propio jsdom, así que los stubs no se filtran a otros archivos.

beforeEach(() => {
  createNoteMock.mockReset();
  createNoteMock.mockResolvedValue('new-note');
  updateMetaMock.mockReset();
  syncLinksMock.mockReset();
  syncLinksMock.mockResolvedValue({ outgoingLinkIds: ['x1'], linkCount: 1 });
});

const para = (value: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

function mount(content: JSONContent[]): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [StarterKit, Wikilink.configure({ noteId: 'current' })],
    content: { type: 'doc', content },
  });
}

function posOf(editor: Editor, needle: string, offset = 0): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return;
    const index = node.text!.indexOf(needle);
    if (index >= 0) found = pos + index + offset;
  });
  return found;
}

function select(editor: Editor, from: string, to = from) {
  editor.commands.setTextSelection({
    from: posOf(editor, from),
    to: posOf(editor, to, to.length),
  });
}

describe('convertSelectionToNote (Editor real)', () => {
  it('crea la nota con el contenido seleccionado y reemplaza la selección por un wikilink', async () => {
    const editor = mount([para('hola mundo cruel')]);
    select(editor, 'mundo');

    await expect(convertSelectionToNote(editor, 'u1')).resolves.toBe('done');

    const args = createNoteMock.mock.calls[0]![0]!;
    expect(args.title).toBe('mundo');
    expect(args.contentPlain).toBe('mundo');
    expect(JSON.parse(args.content as string)).toEqual({
      type: 'doc',
      content: [para('mundo')],
    });

    const inline = editor.getJSON().content![0]!.content!;
    expect(inline).toEqual([
      { type: 'text', text: 'hola ' },
      { type: 'wikilink', attrs: { noteId: 'new-note', noteTitle: 'mundo' } },
      { type: 'text', text: ' cruel' },
    ]);
  });

  it('una sola transacción: un Ctrl+Z restaura el texto original', async () => {
    const editor = mount([para('hola mundo cruel')]);
    select(editor, 'mundo');
    let docChanges = 0;
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) docChanges += 1;
    });
    await convertSelectionToNote(editor, 'u1');
    // History agrupa transacciones cercanas, así que el undo solo no prueba "una transacción".
    expect(docChanges).toBe(1);
    expect(editor.getText()).not.toContain('mundo');

    editor.commands.undo();

    expect(editor.getJSON().content).toEqual([para('hola mundo cruel')]);
  });

  it('si la creación falla (null) no toca la selección ni el documento', async () => {
    createNoteMock.mockResolvedValue(null);
    const editor = mount([para('hola mundo cruel')]);
    select(editor, 'mundo');
    const before = editor.state.doc;
    const { from, to } = editor.state.selection;

    await expect(convertSelectionToNote(editor, 'u1')).resolves.toBe('error');

    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection.from).toBe(from);
    expect(editor.state.selection.to).toBe(to);
  });

  it('multi-párrafo: los bloques se mueven a la nota y el rango queda como un wikilink', async () => {
    const editor = mount([para('uno dos'), para('tres'), para('cuatro cinco')]);
    editor.commands.setTextSelection({
      from: posOf(editor, 'dos'),
      to: posOf(editor, 'cuatro', 6),
    });

    await expect(convertSelectionToNote(editor, 'u1')).resolves.toBe('done');

    const saved = JSON.parse(createNoteMock.mock.calls[0]![0]!.content as string);
    expect(saved.content).toEqual([para('dos'), para('tres'), para('cuatro')]);
    const paragraphs = editor.getJSON().content!;
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.content).toContainEqual({
      type: 'wikilink',
      attrs: { noteId: 'new-note', noteTitle: 'dos' },
    });
  });

  it('toda la nota seleccionada: queda un párrafo con el wikilink', async () => {
    const editor = mount([para('uno'), para('dos')]);
    editor.commands.selectAll();

    await expect(convertSelectionToNote(editor, 'u1')).resolves.toBe('done');

    expect(editor.getJSON().content).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'wikilink', attrs: { noteId: 'new-note', noteTitle: 'uno' } }],
      },
    ]);
    editor.commands.undo();
    expect(editor.getJSON().content).toEqual([para('uno'), para('dos')]);
  });

  it('si el documento cambió mientras se creaba la nota, no reemplaza nada', async () => {
    const editor = mount([para('hola mundo cruel')]);
    select(editor, 'mundo');
    createNoteMock.mockImplementation(async () => {
      editor.commands.insertContentAt(1, 'XX');
      return 'new-note';
    });

    await expect(convertSelectionToNote(editor, 'u1')).resolves.toBe('error');

    expect(editor.getText()).toBe('XXhola mundo cruel');
  });

  it('selección vacía: no hace nada', async () => {
    const editor = mount([para('hola')]);
    editor.commands.setTextSelection(2);

    await expect(convertSelectionToNote(editor, 'u1')).resolves.toBe('noop');
    expect(createNoteMock).not.toHaveBeenCalled();
  });

  it('con wikilinks dentro del contenido movido, sincroniza los links de la nota nueva', async () => {
    const editor = mount([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'ver ' },
          { type: 'wikilink', attrs: { noteId: 'x1', noteTitle: 'Idea X' } },
          { type: 'text', text: ' ahora' },
        ],
      },
    ]);
    editor.commands.selectAll();

    await convertSelectionToNote(editor, 'u1');

    expect(syncLinksMock).toHaveBeenCalledOnce();
    const input = syncLinksMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.sourceId).toBe('new-note');
    expect(input.userId).toBe('u1');
    expect(input.newLinks).toEqual([expect.objectContaining({ targetId: 'x1' })]);
    expect(updateMetaMock).toHaveBeenCalledWith('new-note', {
      outgoingLinkIds: JSON.stringify(['x1']),
      linkCount: 1,
    });
  });

  it('sin wikilinks dentro no toca links', async () => {
    const editor = mount([para('hola mundo')]);
    select(editor, 'mundo');
    await convertSelectionToNote(editor, 'u1');
    expect(syncLinksMock).not.toHaveBeenCalled();
  });
});
