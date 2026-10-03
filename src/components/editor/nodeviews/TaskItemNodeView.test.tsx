// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { createStore, type Store } from 'tinybase';
import TaskItemEditor from '@/components/editor/extensions/task-item-editor';
import StoreHydrationProvider from '@/hooks/StoreHydrationProvider';
import { initTestI18n, tEs } from '@/test/i18n';
import type { Editor, JSONContent } from '@tiptap/core';

// NodeView real (React) dentro de EditorContent. El repo se mockea pero escribe en
// el store inyectado igual que el real (optimista y síncrono), para ver el ciclo
// completo checkbox → repo → store → checkbox.

let store: Store;
let nextId = 0;
const createTaskMock = vi.fn(async (name: string, options?: { noteIds?: string[] }) => {
  const id = `t-${++nextId}`;
  store.setRow('tasks', id, {
    name,
    status: 'in-progress',
    noteIds: JSON.stringify(options?.noteIds ?? []),
  });
  return id;
});
const completeTaskMock = vi.fn(async (id: string) => {
  const done = store.getCell('tasks', id, 'status') === 'completed';
  store.setCell('tasks', id, 'status', done ? 'in-progress' : 'completed');
});

vi.mock('@/infra/repos/tasksRepo', () => ({
  tasksRepo: {
    createTask: (name: string, options?: { noteIds?: string[] }) => createTaskMock(name, options),
    completeTask: (id: string) => completeTaskMock(id),
  },
}));

beforeAll(async () => {
  await initTestI18n();
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

beforeEach(() => {
  store = createStore();
  nextId = 0;
  createTaskMock.mockClear();
  completeTaskMock.mockClear();
});

afterEach(() => {
  cleanup();
});

const item = (text: string, attrs: Record<string, unknown> = {}): JSONContent => ({
  type: 'taskItem',
  attrs: { checked: false, ...attrs },
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
});

let editorRef: Editor | null = null;

function exposeEditor(editor: Editor | null) {
  editorRef = editor;
}

function Harness({ content, editable }: { content: JSONContent[]; editable: boolean }) {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      TaskList,
      TaskItemEditor.configure({ nested: true, noteId: 'note-1', getTaskStore: () => store }),
    ],
    content: { type: 'doc', content: [{ type: 'taskList', content }] },
  });
  useEffect(() => exposeEditor(editor), [editor]);
  return <EditorContent editor={editor} />;
}

async function renderEditor(content: JSONContent[], editable = true) {
  render(
    <MemoryRouter initialEntries={['/notes/note-1']}>
      <StoreHydrationProvider value={{ isHydrating: false }}>
        <Routes>
          <Route path="/notes/:id" element={<Harness content={content} editable={editable} />} />
          <Route path="/tasks" element={<p>pantalla-tareas</p>} />
        </Routes>
      </StoreHydrationProvider>
    </MemoryRouter>,
  );
  // `create` de TipTap (sync inicial + listener del store) corre en un setTimeout(0).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function taskItemNodes(): Array<{ checked: boolean; taskId: string | null }> {
  const out: Array<{ checked: boolean; taskId: string | null }> = [];
  editorRef!.state.doc.descendants((node) => {
    if (node.type.name === 'taskItem') {
      out.push({
        checked: node.attrs.checked as boolean,
        taskId: (node.attrs.taskId as string | null) ?? null,
      });
    }
  });
  return out;
}

const createLabel = () => tEs('editor.task.createTask');
const linkedLabel = () => tEs('editor.task.linked');

describe('TaskItemNodeView', () => {
  it('sin taskId: botón "Crear tarea" con aria-label traducido; crea, vincula y muestra el ícono', async () => {
    await renderEditor([item('Llamar a Ana')]);
    const button = screen.getByRole('button', { name: createLabel() });
    expect(button.getAttribute('title')).toBe(createLabel());

    await act(async () => {
      fireEvent.click(button);
    });
    expect(createTaskMock).toHaveBeenCalledExactlyOnceWith('Llamar a Ana', { noteIds: ['note-1'] });
    expect(taskItemNodes()).toEqual([{ checked: false, taskId: 't-1' }]);
    expect(screen.queryByRole('button', { name: createLabel() })).toBeNull();
    expect(screen.getByRole('button', { name: linkedLabel() })).toBeTruthy();
  });

  it('doble click durante la creación: una sola tarea', async () => {
    await renderEditor([item('Una vez')]);
    const button = screen.getByRole('button', { name: createLabel() });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(createTaskMock).toHaveBeenCalledTimes(1);
  });

  it('el ícono de vinculada lleva a /tasks', async () => {
    store.setRow('tasks', 't1', { name: 'x', status: 'in-progress' });
    await renderEditor([item('x', { taskId: 't1' })]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: linkedLabel() }));
    });
    expect(screen.getByText('pantalla-tareas')).toBeTruthy();
  });

  it('store → checkbox: completar la tarea en el store marca el checkbox', async () => {
    store.setRow('tasks', 't1', { name: 'x', status: 'in-progress' });
    await renderEditor([item('x', { taskId: 't1' })]);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.getAttribute('aria-label')).toBe(tEs('tasks.card.completeAria'));

    act(() => {
      store.setCell('tasks', 't1', 'status', 'completed');
    });
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('checkbox').getAttribute('aria-label')).toBe(
      tEs('tasks.card.markPendingAria'),
    );
    expect(completeTaskMock).not.toHaveBeenCalled();
  });

  it('checkbox → repo: marcar completa la tarea una sola vez y queda marcado', async () => {
    store.setRow('tasks', 't1', { name: 'x', status: 'in-progress' });
    await renderEditor([item('x', { taskId: 't1' })]);
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'));
    });
    expect(completeTaskMock).toHaveBeenCalledExactlyOnceWith('t1');
    expect(store.getCell('tasks', 't1', 'status')).toBe('completed');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect(taskItemNodes()).toEqual([{ checked: true, taskId: 't1' }]);
  });

  it('tarea borrada: sin ícono de vinculada, checkbox local y taskId limpio al marcar', async () => {
    await renderEditor([item('x', { taskId: 't-borrada' })]);
    expect(screen.queryByRole('button', { name: linkedLabel() })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'));
    });
    expect(completeTaskMock).not.toHaveBeenCalled();
    expect(taskItemNodes()).toEqual([{ checked: true, taskId: null }]);
  });

  it('solo-lectura: sin botón "Crear tarea" y checkbox deshabilitado', async () => {
    await renderEditor([item('x')], false);
    expect(screen.queryByRole('button', { name: createLabel() })).toBeNull();
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('item sin texto: no ofrece crear tarea', async () => {
    await renderEditor([item('')]);
    expect(screen.queryByRole('button', { name: createLabel() })).toBeNull();
  });

  it('el botón vive dentro de su item (li) y no dentro del contenido editable', async () => {
    await renderEditor([item('x')]);
    const li = document.querySelector('li[data-type="taskItem"]') as HTMLElement;
    const action = li.querySelector(':scope > .task-item-action') as HTMLElement;
    expect(action.getAttribute('contenteditable')).toBe('false');
    expect(within(action).getByRole('button', { name: createLabel() })).toBeTruthy();
  });
});
