// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import { createPlaceholderExtension } from '@/components/editor/extensions/placeholder-config';

// Editor TipTap real con la misma config de Placeholder que usa NoteEditor.

const texts = { emptyDoc: 'DOC', emptyLine: 'LINE' };
const hola: JSONContent = { type: 'paragraph', content: [{ type: 'text', text: 'hola' }] };

const originals = {
  elementFromPoint: document.elementFromPoint,
  getClientRects: Range.prototype.getClientRects,
  getBoundingClientRect: Range.prototype.getBoundingClientRect,
};

beforeAll(() => {
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

function mount(content: JSONContent[]): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      createPlaceholderExtension(texts),
    ],
    content: { type: 'doc', content },
  });
}

function decorations(editor: Editor): string[] {
  return Array.from(editor.view.dom.querySelectorAll('[data-placeholder]')).map(
    (node) => node.getAttribute('data-placeholder') ?? '',
  );
}

function firstEmptyParagraphInside(editor: Editor): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.type.name === 'paragraph' && node.content.size === 0) found = pos + 1;
  });
  return found;
}

describe('Placeholder con Editor real', () => {
  it('nota vacía → texto de nota vacía', () => {
    const editor = mount([{ type: 'paragraph' }]);
    expect(decorations(editor)).toEqual(['DOC']);
  });

  it('[p, p] con el cursor en la segunda → decoración de línea', () => {
    const editor = mount([{ type: 'paragraph' }, { type: 'paragraph' }]);
    editor.commands.setTextSelection(3);
    expect(decorations(editor)).toEqual(['LINE']);
  });

  it('párrafo vacío tras contenido → decoración de línea', () => {
    const editor = mount([hola, { type: 'paragraph' }]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(decorations(editor)).toEqual(['LINE']);
  });

  it('cursor en una celda de tabla → sin decoración', () => {
    const editor = mount([
      hola,
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] },
        ],
      },
    ]);
    editor.commands.setTextSelection(firstEmptyParagraphInside(editor));
    expect(decorations(editor)).toEqual([]);
  });

  it('cursor en un item de tarea → sin decoración', () => {
    const editor = mount([
      hola,
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
        ],
      },
    ]);
    editor.commands.setTextSelection(firstEmptyParagraphInside(editor));
    expect(decorations(editor)).toEqual([]);
  });

  it('el JSON guardado no contiene rastro del placeholder', () => {
    const editor = mount([hola, { type: 'paragraph' }]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(decorations(editor)).toEqual(['LINE']);
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('LINE');
    expect(json).not.toContain('placeholder');
    expect(json).toBe(JSON.stringify({ type: 'doc', content: [hola, { type: 'paragraph' }] }));
  });
});
