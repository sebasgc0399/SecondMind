// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { Editor, getSchema, type JSONContent } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { exportExtensions } from '@/lib/export/exportExtensions';
import TaskItemLinked from '@/components/editor/extensions/task-item-linked';
import { serializeNoteContent } from '@/lib/export/serializeNote';

// Extensión de schema compartida editor/export (SPEC-71 T4, I8): atributo `taskId`.

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

const item = (text: string, attrs: Record<string, unknown> = {}): JSONContent => ({
  type: 'taskItem',
  attrs: { checked: false, ...attrs },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const doc = (...items: JSONContent[]): JSONContent => ({
  type: 'doc',
  content: [{ type: 'taskList', content: items }],
});

function mount(content: JSONContent): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [StarterKit, TaskList, TaskItemLinked.configure({ nested: true })],
    content,
  });
}

function taskItems(editor: Editor): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'taskItem')
      out.push({ ...node.attrs, text: node.firstChild?.textContent });
  });
  return out;
}

describe('TaskItemLinked — atributo taskId', () => {
  it('round-trip en JSON: taskId se conserva y el default es null', () => {
    const editor = mount(doc(item('vinculada', { taskId: 't1' }), item('local')));
    const json = editor.getJSON();
    const list = (json.content![0] as JSONContent).content as JSONContent[];
    expect(list[0]!.attrs).toEqual({ checked: false, taskId: 't1' });
    expect(list[1]!.attrs).toEqual({ checked: false, taskId: null });

    // Re-cargar el JSON guardado da el mismo doc.
    const again = mount(json);
    expect(again.getJSON()).toEqual(json);
    editor.destroy();
    again.destroy();
  });

  it('Enter al final de un item vinculado: el item nuevo nace sin taskId', () => {
    const editor = mount(doc(item('vinculada', { taskId: 't1' })));
    let end = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText) end = pos + node.nodeSize;
    });
    editor.commands.setTextSelection(end);
    editor.commands.splitListItem('taskItem');
    editor.commands.insertContent('nueva');

    expect(taskItems(editor)).toEqual([
      { checked: false, taskId: 't1', text: 'vinculada' },
      { checked: false, taskId: null, text: 'nueva' },
    ]);
    editor.destroy();
  });

  it('HTML (portapapeles): data-task-id se emite y se vuelve a leer', () => {
    const editor = mount(doc(item('vinculada', { taskId: 't1' }), item('local')));
    const html = editor.getHTML();
    expect(html).toContain('data-task-id="t1"');
    expect(html.match(/data-task-id/g)).toHaveLength(1);

    const pasted = mount({ type: 'doc', content: [] });
    pasted.commands.setContent(html);
    expect(taskItems(pasted).map((attrs) => attrs.taskId)).toEqual(['t1', null]);
    editor.destroy();
    pasted.destroy();
  });
});

describe('export (I8) con el atributo taskId', () => {
  it('el schema del export conoce taskId (el JSON de una nota vinculada es válido)', () => {
    const json = doc(item('hecho', { checked: true, taskId: 't1' }), item('local'));
    // ProseMirror rechaza atributos desconocidos (`Unsupported attribute`).
    const node = ProseMirrorNode.fromJSON(getSchema(exportExtensions), json);
    const attrs: Array<Record<string, unknown>> = [];
    node.descendants((child) => {
      if (child.type.name === 'taskItem') attrs.push(child.attrs);
    });
    expect(attrs).toEqual([
      { checked: true, taskId: 't1' },
      { checked: false, taskId: null },
    ]);
  });

  const noResolve = (_id: string | null | undefined, title: string) => title;

  it('sin taskId: mismo Markdown de siempre', () => {
    expect(
      serializeNoteContent(
        doc(item('hecho', { checked: true }), item('pendiente')),
        noResolve,
      ).trim(),
    ).toBe('- [x] hecho\n- [ ] pendiente');
  });

  it('con taskId: el Markdown no cambia (el vínculo no se exporta)', () => {
    expect(
      serializeNoteContent(
        doc(item('hecho', { checked: true, taskId: 't1' }), item('pendiente', { taskId: 't2' })),
        noResolve,
      ).trim(),
    ).toBe('- [x] hecho\n- [ ] pendiente');
  });
});
