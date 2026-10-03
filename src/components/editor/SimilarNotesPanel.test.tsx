// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Provider } from 'tinybase/ui-react';
import { createStore } from 'tinybase';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Wikilink from '@/components/editor/extensions/wikilink';
import FocusTracking from '@/components/editor/extensions/focus-tracking';
import SimilarNotesPanel from '@/components/editor/SimilarNotesPanel';
import { initTestI18n, tEs } from '@/test/i18n';

vi.mock('@/hooks/useOnlineStatus', () => ({ default: () => true }));
vi.mock('@/hooks/useSimilarNotes', () => ({
  default: () => ({
    notes: [
      { noteId: 'n1', title: 'Nota uno', score: 0.9 },
      { noteId: 'n2', title: 'Nota dos', score: 0.7 },
    ],
    isLoading: false,
    noEmbedding: false,
    disabled: false,
  }),
}));

const originals = {
  elementFromPoint: document.elementFromPoint,
  getClientRects: Range.prototype.getClientRects,
  getBoundingClientRect: Range.prototype.getBoundingClientRect,
};

beforeAll(async () => {
  await initTestI18n();
  // jsdom no implementa estas APIs de layout que ProseMirror consulta.
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

afterAll(() => {
  document.elementFromPoint = originals.elementFromPoint;
  Range.prototype.getClientRects = originals.getClientRects;
  Range.prototype.getBoundingClientRect = originals.getBoundingClientRect;
});

const para = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

function mountEditor(content: JSONContent[]): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [StarterKit, Wikilink.configure({ noteId: 'cur' }), FocusTracking],
    content: { type: 'doc', content },
  });
}

function wikilinks(editor: Editor): Array<{ noteId: string; noteTitle: string }> {
  const found: Array<{ noteId: string; noteTitle: string }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'wikilink') {
      found.push({
        noteId: node.attrs.noteId as string,
        noteTitle: node.attrs.noteTitle as string,
      });
    }
  });
  return found;
}

function setup(editor: Editor | null, outgoing = '[]') {
  const store = createStore().setTable('notes', {
    cur: { title: 'Actual', outgoingLinkIds: outgoing },
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <SimilarNotesPanel noteId="cur" editor={editor} />
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

const insertLabel = () => tEs('editor.similar.insertLink');
const linkedLabel = () => tEs('editor.similar.alreadyLinked');
const isUnavailable = (b: HTMLElement) => b.getAttribute('aria-disabled') === 'true';

describe('SimilarNotesPanel — insertar enlace', () => {
  let editor: Editor;

  beforeEach(() => {
    cleanup();
    editor = mountEditor([para('hola mundo')]);
  });

  afterEach(() => {
    cleanup();
    const host = editor.view.dom.parentElement;
    editor.destroy();
    host?.remove();
  });

  it('inserta un wikilink con el noteId y noteTitle de la nota elegida', () => {
    setup(editor);
    const buttons = screen.getAllByRole('button', { name: insertLabel() });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1] as HTMLElement);
    expect(wikilinks(editor)).toEqual([{ noteId: 'n2', noteTitle: 'Nota dos' }]);
  });

  it('sin foco previo inserta al final del documento', () => {
    setup(editor);
    fireEvent.click(screen.getAllByRole('button', { name: insertLabel() }).at(0) as HTMLElement);
    const last = editor.state.doc.lastChild;
    expect(last?.lastChild?.type.name).toBe('wikilink');
    expect(editor.getText()).toContain('hola mundo');
  });

  it('con foco previo inserta en la posición del cursor', () => {
    setup(editor);
    act(() => {
      editor.view.dom.dispatchEvent(new FocusEvent('focus'));
      editor.commands.setTextSelection(5); // "hola| mundo"
    });
    fireEvent.click(screen.getAllByRole('button', { name: insertLabel() }).at(0) as HTMLElement);
    const para1 = editor.state.doc.firstChild;
    expect(para1?.child(0).text).toBe('hola');
    expect(para1?.child(1).type.name).toBe('wikilink');
    expect(para1?.child(2).text).toBe(' mundo');
  });

  it('queda deshabilitado con tooltip "Ya enlazada" si está en outgoingLinkIds', () => {
    setup(editor, JSON.stringify(['n1']));
    const linked = screen.getByRole('button', { name: linkedLabel() }) as HTMLButtonElement;
    expect(isUnavailable(linked)).toBe(true);
    expect(linked.title).toBe(linkedLabel());
    fireEvent.click(linked);
    expect(wikilinks(editor)).toEqual([]);
    // la otra sigue habilitada
    expect(isUnavailable(screen.getByRole('button', { name: insertLabel() }))).toBe(false);
  });

  it('"Ya enlazada" sigue enfocable con teclado (aria-disabled, no disabled)', () => {
    setup(editor, JSON.stringify(['n1']));
    const linked = screen.getByRole('button', { name: linkedLabel() }) as HTMLButtonElement;
    expect(linked.disabled).toBe(false);
    expect(linked.getAttribute('aria-disabled')).toBe('true');
    linked.focus();
    expect(document.activeElement).toBe(linked);
    fireEvent.click(linked);
    expect(wikilinks(editor)).toEqual([]);
  });

  it('reacciona si cambia outgoingLinkIds', () => {
    const store = setup(editor);
    expect(screen.queryByRole('button', { name: linkedLabel() })).toBeNull();
    act(() => {
      store.setCell('notes', 'cur', 'outgoingLinkIds', JSON.stringify(['n2']));
    });
    expect(isUnavailable(screen.getByRole('button', { name: linkedLabel() }))).toBe(true);
    act(() => {
      store.setCell('notes', 'cur', 'outgoingLinkIds', '[]');
    });
    expect(screen.queryByRole('button', { name: linkedLabel() })).toBeNull();
  });

  it('el título sigue siendo un link de navegación', () => {
    setup(editor);
    expect(screen.getByRole('link', { name: /Nota uno/ }).getAttribute('href')).toBe('/notes/n1');
  });

  it('sin editor los botones están deshabilitados', () => {
    setup(null);
    for (const b of screen.getAllByRole('button', { name: insertLabel() })) {
      expect(isUnavailable(b)).toBe(true);
    }
  });

  it('panel montado después de enfocar el editor: inserta en el cursor (mobile)', () => {
    // El usuario escribe con el panel cerrado y deja el cursor a mitad de párrafo.
    act(() => {
      editor.view.dom.dispatchEvent(new FocusEvent('focus'));
      editor.commands.setTextSelection(5); // "hola| mundo"
    });
    setup(editor); // recién ahora se abre el panel
    fireEvent.click(screen.getAllByRole('button', { name: insertLabel() }).at(0) as HTMLElement);
    const para1 = editor.state.doc.firstChild;
    expect(para1?.child(0).text).toBe('hola');
    expect(para1?.child(1).type.name).toBe('wikilink');
    expect(para1?.child(2).text).toBe(' mundo');
  });

  it('se deshabilita si el doc ya tiene un wikilink a esa nota (antes del guardado)', () => {
    setup(editor);
    const first = screen.getAllByRole('button', { name: insertLabel() }).at(0) as HTMLElement;
    fireEvent.click(first);
    expect(wikilinks(editor)).toHaveLength(1);
    const linked = screen.getByRole('button', { name: linkedLabel() });
    expect(isUnavailable(linked)).toBe(true);
    fireEvent.click(linked);
    expect(wikilinks(editor)).toHaveLength(1);
    // reactivo: si el enlace sale del doc, se vuelve a habilitar
    act(() => {
      editor.commands.setContent({ type: 'doc', content: [para('x')] });
    });
    expect(screen.queryByRole('button', { name: linkedLabel() })).toBeNull();
  });
});

describe('SimilarNotesPanel — cursor dentro de un bloque de código', () => {
  afterEach(() => cleanup());

  it('no parte el codeBlock: el enlace va en un párrafo nuevo después del bloque', () => {
    const editor = mountEditor([
      para('antes'),
      { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
    ]);
    setup(editor);
    act(() => {
      editor.view.dom.dispatchEvent(new FocusEvent('focus'));
      editor.commands.setTextSelection(12); // dentro del código
    });
    fireEvent.click(screen.getAllByRole('button', { name: insertLabel() }).at(0) as HTMLElement);
    const doc = editor.state.doc;
    // (StarterKit agrega un párrafo vacío final tras un codeBlock: TrailingNode.)
    const codeBlocks: string[] = [];
    doc.forEach((node) => {
      if (node.type.name === 'codeBlock') codeBlocks.push(node.textContent);
    });
    expect(codeBlocks).toEqual(['const x = 1;']);
    expect(doc.child(1).type.name).toBe('codeBlock');
    expect(doc.child(1).textContent).toBe('const x = 1;');
    expect(doc.child(2).type.name).toBe('paragraph');
    expect(doc.child(2).firstChild?.type.name).toBe('wikilink');
    expect(wikilinks(editor)).toEqual([{ noteId: 'n1', noteTitle: 'Nota uno' }]);
    const host = editor.view.dom.parentElement;
    editor.destroy();
    host?.remove();
  });
});
