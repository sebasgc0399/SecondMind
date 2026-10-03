// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItemEditor from '@/components/editor/extensions/task-item-editor';
import {
  createStoreTaskLookup,
  toggleTaskItem,
} from '@/components/editor/extensions/task-item-sync';
import { tasksRepo } from '@/infra/repos/tasksRepo';
import { tasksStore } from '@/stores/tasksStore';

// Checkbox de un item vinculado contra el `tasksRepo` REAL (SPEC-71 T4, E2-T4-d):
// el toggle cuenta con que `completeTask` escriba `tasksStore` de forma síncrona
// (`setPartialRow` antes del primer await) para que el sync se guarde. Si el repo
// dejara de hacerlo, el sync llegaría sin `localToggleDepth` y el toggle del
// usuario no dispararía el autosave. Firebase mockeado como en `tasksRepo.test.ts`.

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } as { uid: string } | null },
  db: {} as object,
}));

const setDocMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: vi.fn(),
  doc: (_db: object, path: string) => ({ __path: path }),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  collection: vi.fn(),
  serverTimestamp: vi.fn(),
}));

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

let editor: Editor | null = null;

beforeEach(() => {
  setDocMock.mockReset();
  setDocMock.mockResolvedValue(undefined);
  tasksStore.delTables();
});

afterEach(() => {
  editor?.destroy();
  editor = null;
});

async function mountLinked(taskId: string): Promise<Editor> {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const created = new Editor({
    element,
    extensions: [
      StarterKit,
      TaskList,
      TaskItemEditor.configure({ nested: true, noteId: 'note-1', getTaskStore: () => tasksStore }),
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false, taskId },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tarea' }] }],
            },
          ],
        },
      ],
    },
  });
  // `create` (onCreate: sync inicial + listener del store) llega en un setTimeout(0).
  await new Promise((resolve) => setTimeout(resolve, 0));
  return created;
}

describe('checkbox → tasksRepo real', () => {
  it('marcar el item completa la tarea y produce exactamente 1 `update` del editor', async () => {
    tasksStore.setRow('tasks', 't1', { name: 'Tarea', status: 'in-progress', completedAt: 0 });
    editor = await mountLinked('t1');
    const onUpdate = vi.fn();
    editor.on('update', onUpdate);

    const result = toggleTaskItem({
      editor,
      pos: 1,
      checked: true,
      lookup: createStoreTaskLookup(tasksStore),
      isHydrating: false,
      completeTask: tasksRepo.completeTask,
    });

    expect(result).toBe('task');
    // Se deja asentar el repo (promesas/cola) antes de contar: el conteo final es lo que importa.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tasksStore.getCell('tasks', 't1', 'status')).toBe('completed');
    expect(editor.state.doc.nodeAt(1)?.attrs.checked).toBe(true);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
