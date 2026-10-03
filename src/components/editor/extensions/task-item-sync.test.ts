// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { createStore, type Store } from 'tinybase';
import TaskItemEditor from '@/components/editor/extensions/task-item-editor';
import {
  createLinkedTask,
  createStoreTaskLookup,
  toggleTaskItem,
} from '@/components/editor/extensions/task-item-sync';
import type { CreateTaskOptions } from '@/infra/repos/tasksRepo';

// Editor TipTap real (sin React: el NodeView cae al render nativo) + store TinyBase
// propio inyectado. El repo se pasa como funciones mock (I3: escrituras por repo).

beforeAll(() => {
  // jsdom no implementa estas APIs de layout que ProseMirror consulta.
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

let store: Store;
const completeTask = vi.fn<(taskId: string) => Promise<void>>();
const createTask = vi.fn<(name: string, options?: CreateTaskOptions) => Promise<string | null>>();

beforeEach(() => {
  store = createStore();
  completeTask.mockReset();
  completeTask.mockResolvedValue(undefined);
  createTask.mockReset();
  createTask.mockResolvedValue('t-new');
});

const item = (
  text: string,
  attrs: Record<string, unknown> = {},
  nested?: JSONContent,
): JSONContent => ({
  type: 'taskItem',
  attrs: { checked: false, ...attrs },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...(nested ? [nested] : [])],
});

const list = (...items: JSONContent[]): JSONContent => ({ type: 'taskList', content: items });

async function mount(...items: JSONContent[]): Promise<Editor> {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      TaskList,
      TaskItemEditor.configure({ nested: true, noteId: 'note-1', getTaskStore: () => store }),
    ],
    content: { type: 'doc', content: [list(...items)] },
  });
  // TipTap emite `create` (onCreate: sync inicial + listener del store) en un setTimeout(0).
  await new Promise((resolve) => setTimeout(resolve, 0));
  return editor;
}

interface ItemInfo {
  pos: number;
  text: string;
  checked: boolean;
  taskId: string | null;
}

function items(editor: Editor): ItemInfo[] {
  const out: ItemInfo[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'taskItem') {
      out.push({
        pos,
        text: node.firstChild?.textContent ?? '',
        checked: node.attrs.checked as boolean,
        taskId: (node.attrs.taskId as string | null) ?? null,
      });
    }
  });
  return out;
}

const setTask = (id: string, status: string) => store.setRow('tasks', id, { name: id, status });

describe('store → checkbox', () => {
  it('al montar, el item vinculado toma el estado de su tarea', async () => {
    setTask('t1', 'completed');
    const editor = await mount(item('a', { taskId: 't1' }), item('local'));
    expect(items(editor).map((i) => i.checked)).toEqual([true, false]);
    editor.destroy();
  });

  it('completar/reabrir la tarea en el store marca/desmarca el item, sin llamar al repo', async () => {
    setTask('t1', 'in-progress');
    const editor = await mount(item('a', { taskId: 't1' }));
    expect(items(editor)[0]!.checked).toBe(false);

    store.setCell('tasks', 't1', 'status', 'completed');
    expect(items(editor)[0]!.checked).toBe(true);
    store.setCell('tasks', 't1', 'status', 'in-progress');
    expect(items(editor)[0]!.checked).toBe(false);
    // Sin bucle store → nodo → repo.
    expect(completeTask).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('el sync no dispara `update` (no autosave) ni entra al historial', async () => {
    setTask('t1', 'in-progress');
    const editor = await mount(item('a', { taskId: 't1' }));
    const onUpdate = vi.fn();
    editor.on('update', onUpdate);

    store.setCell('tasks', 't1', 'status', 'completed');
    expect(items(editor)[0]!.checked).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
    // Deshacer no tiene nada que revertir: el check sigue.
    editor.commands.undo();
    expect(items(editor)[0]!.checked).toBe(true);
    editor.destroy();
  });

  it('items anidados: cada uno sigue a su propia tarea', async () => {
    setTask('t1', 'in-progress');
    setTask('t2', 'in-progress');
    const editor = await mount(
      item('padre', { taskId: 't1' }, list(item('hijo', { taskId: 't2' }))),
    );
    store.setCell('tasks', 't2', 'status', 'completed');
    expect(items(editor).map((i) => [i.text, i.checked])).toEqual([
      ['padre', false],
      ['hijo', true],
    ]);
    editor.destroy();
  });

  it('tarea borrada: el item queda como checkbox local (sin tocar su estado)', async () => {
    setTask('t1', 'completed');
    const editor = await mount(item('a', { taskId: 't1' }));
    expect(items(editor)[0]!.checked).toBe(true);
    store.delRow('tasks', 't1');
    expect(items(editor)[0]).toMatchObject({ checked: true, taskId: 't1' });
    editor.destroy();
  });

  it('al destruir el editor deja de escuchar el store', async () => {
    setTask('t1', 'in-progress');
    const editor = await mount(item('a', { taskId: 't1' }));
    const before = store.getListenerStats().table ?? 0;
    editor.destroy();
    expect(store.getListenerStats().table ?? 0).toBe(before - 1);
    expect(() => store.setCell('tasks', 't1', 'status', 'completed')).not.toThrow();
  });
});

describe('checkbox → repo', () => {
  it('marcar un item vinculado llama al repo; si el repo no escribió, el nodo no cambia', async () => {
    setTask('t1', 'in-progress');
    const editor = await mount(item('a', { taskId: 't1' }));
    const result = toggleTaskItem({
      editor,
      pos: items(editor)[0]!.pos,
      checked: true,
      lookup: createStoreTaskLookup(store),
      isHydrating: false,
      completeTask,
    });
    expect(result).toBe('task');
    expect(completeTask).toHaveBeenCalledExactlyOnceWith('t1');
    // Este mock no tocó el store (repo sin sesión): el nodo no se adelanta al store.
    expect(items(editor)[0]!.checked).toBe(false);
    editor.destroy();
  });

  it('desmarcar un item vinculado reabre la tarea; si ya coincide no llama al repo', async () => {
    setTask('t1', 'completed');
    const editor = await mount(item('a', { taskId: 't1' }));
    const lookup = createStoreTaskLookup(store);
    toggleTaskItem({ editor, pos: 1, checked: false, lookup, isHydrating: false, completeTask });
    expect(completeTask).toHaveBeenCalledExactlyOnceWith('t1');

    completeTask.mockClear();
    store.setCell('tasks', 't1', 'status', 'in-progress');
    toggleTaskItem({ editor, pos: 1, checked: false, lookup, isHydrating: false, completeTask });
    expect(completeTask).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('con el repo real (store optimista) no hay bucle: una sola escritura y el nodo coherente', async () => {
    setTask('t1', 'in-progress');
    const editor = await mount(item('a', { taskId: 't1' }));
    // Simula completeTask del repo: setPartialRow síncrono (dispara el listener del store).
    const repoComplete = vi.fn(async (id: string) => {
      const done = store.getCell('tasks', id, 'status') === 'completed';
      store.setCell('tasks', id, 'status', done ? 'in-progress' : 'completed');
    });
    const onUpdate = vi.fn();
    editor.on('update', onUpdate);
    toggleTaskItem({
      editor,
      pos: 1,
      checked: true,
      lookup: createStoreTaskLookup(store),
      isHydrating: false,
      completeTask: repoComplete,
    });
    expect(repoComplete).toHaveBeenCalledTimes(1);
    expect(store.getCell('tasks', 't1', 'status')).toBe('completed');
    expect(items(editor)[0]!.checked).toBe(true);
    // El toggle del usuario sí se guarda (una vez).
    expect(onUpdate).toHaveBeenCalledTimes(1);
    editor.destroy();
  });

  it('item vinculado a una tarea borrada: vuelve a ser local y limpia el taskId al cambiar', async () => {
    const editor = await mount(item('a', { taskId: 't-borrada' }));
    const result = toggleTaskItem({
      editor,
      pos: 1,
      checked: true,
      lookup: createStoreTaskLookup(store),
      isHydrating: false,
      completeTask,
    });
    expect(result).toBe('unlinked');
    expect(items(editor)[0]).toMatchObject({ checked: true, taskId: null });
    expect(completeTask).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('con el store hidratando, una tarea "faltante" no se desvincula', async () => {
    const editor = await mount(item('a', { taskId: 't1' }));
    const result = toggleTaskItem({
      editor,
      pos: 1,
      checked: true,
      lookup: createStoreTaskLookup(store),
      isHydrating: true,
      completeTask,
    });
    expect(result).toBe('local');
    expect(items(editor)[0]).toMatchObject({ checked: true, taskId: 't1' });
    editor.destroy();
  });

  it('item sin vínculo: toggle local deshacible, sin repo', async () => {
    const editor = await mount(item('a'));
    toggleTaskItem({
      editor,
      pos: 1,
      checked: true,
      lookup: createStoreTaskLookup(store),
      isHydrating: false,
      completeTask,
    });
    expect(items(editor)[0]!.checked).toBe(true);
    editor.commands.undo();
    expect(items(editor)[0]!.checked).toBe(false);
    expect(completeTask).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('solo-lectura: no cambia nada', async () => {
    setTask('t1', 'in-progress');
    const editor = await mount(item('a', { taskId: 't1' }));
    editor.setEditable(false);
    const result = toggleTaskItem({
      editor,
      pos: 1,
      checked: true,
      lookup: createStoreTaskLookup(store),
      isHydrating: false,
      completeTask,
    });
    expect(result).toBe('noop');
    expect(completeTask).not.toHaveBeenCalled();
    expect(items(editor)[0]!.checked).toBe(false);
    editor.destroy();
  });
});

describe('crear tarea desde el item', () => {
  function create(editor: Editor, index = 0) {
    const pos = items(editor)[index]!.pos;
    return createLinkedTask({
      editor,
      getPos: () => pos,
      noteId: 'note-1',
      lookup: createStoreTaskLookup(store),
      createTask,
    });
  }

  it('crea la tarea con el texto del item y la nota, y guarda el taskId en el nodo', async () => {
    const editor = await mount(item('  Llamar a Ana  '));
    expect(await create(editor)).toBe('created');
    expect(createTask).toHaveBeenCalledExactlyOnceWith('Llamar a Ana', { noteIds: ['note-1'] });
    expect(items(editor)[0]!.taskId).toBe('t-new');
    editor.destroy();
  });

  it('item ya marcado: la tarea nace completada', async () => {
    const editor = await mount(item('Hecho', { checked: true }));
    await create(editor);
    expect(createTask).toHaveBeenCalledWith('Hecho', { noteIds: ['note-1'], status: 'completed' });
    editor.destroy();
  });

  it('item anidado: usa solo su texto y vincula solo ese item', async () => {
    const editor = await mount(item('padre', {}, list(item('hijo'))));
    await create(editor, 0);
    expect(createTask).toHaveBeenCalledWith('padre', { noteIds: ['note-1'] });
    expect(items(editor).map((i) => i.taskId)).toEqual(['t-new', null]);

    createTask.mockResolvedValue('t-hijo');
    await create(editor, 1);
    expect(createTask).toHaveBeenLastCalledWith('hijo', { noteIds: ['note-1'] });
    expect(items(editor).map((i) => i.taskId)).toEqual(['t-new', 't-hijo']);
    editor.destroy();
  });

  it('deshacer quita el vínculo y rehacer restaura el MISMO taskId sin crear otra tarea', async () => {
    const editor = await mount(item('Tarea'));
    store.setRow('tasks', 't-new', { name: 'Tarea', status: 'in-progress' });
    await create(editor);
    expect(items(editor)[0]!.taskId).toBe('t-new');

    editor.commands.undo();
    expect(items(editor)[0]!.taskId).toBeNull();
    editor.commands.redo();
    expect(items(editor)[0]!.taskId).toBe('t-new');
    expect(createTask).toHaveBeenCalledTimes(1);
    editor.destroy();
  });

  it('rehacer tras completar la tarea en otro lado: el item vuelve marcado', async () => {
    const editor = await mount(item('Tarea'));
    store.setRow('tasks', 't-new', { name: 'Tarea', status: 'in-progress' });
    await create(editor);
    editor.commands.undo();
    store.setCell('tasks', 't-new', 'status', 'completed');
    expect(items(editor)[0]).toMatchObject({ taskId: null, checked: false });

    editor.commands.redo();
    expect(items(editor)[0]).toMatchObject({ taskId: 't-new', checked: true });
    editor.destroy();
  });

  it('item vacío o ya vinculado a una tarea viva: no crea nada', async () => {
    setTask('t1', 'in-progress');
    const editor = await mount(item('   '), item('b', { taskId: 't1' }));
    expect(await create(editor, 0)).toBe('noop');
    expect(await create(editor, 1)).toBe('noop');
    expect(createTask).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('si createTask falla (null) el item no cambia', async () => {
    createTask.mockResolvedValue(null);
    const editor = await mount(item('Tarea'));
    expect(await create(editor)).toBe('error');
    expect(items(editor)[0]!.taskId).toBeNull();
    editor.destroy();
  });

  it('si el item se borró durante la creación, no se escribe en otro nodo', async () => {
    let resolve: (id: string) => void = () => {};
    createTask.mockReturnValue(new Promise((r) => (resolve = r)));
    const editor = await mount(item('Tarea'));
    let pos: number | undefined = items(editor)[0]!.pos;
    const pending = createLinkedTask({
      editor,
      getPos: () => pos,
      noteId: 'note-1',
      lookup: createStoreTaskLookup(store),
      createTask,
    });
    pos = undefined; // el NodeView ya no tiene posición
    resolve('t-x');
    expect(await pending).toBe('detached');
    expect(items(editor)[0]!.taskId).toBeNull();
    editor.destroy();
  });
});
