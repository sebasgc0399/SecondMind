import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import TaskItemLinked, { TASK_SYNC_META } from '@/components/editor/extensions/task-item-linked';
import {
  buildCheckedSyncTransaction,
  createStoreTaskLookup,
  docHasLinkedTaskItem,
  syncTaskItemsFromStore,
  transactionMayAddLinkedTaskItem,
  type TaskItemSyncStorage,
} from '@/components/editor/extensions/task-item-sync';
import TaskItemNodeView from '@/components/editor/nodeviews/TaskItemNodeView';
import { tasksStore } from '@/stores/tasksStore';
import type { Store } from 'tinybase';
import type { TaskItemOptions } from '@tiptap/extension-task-item';

export interface TaskItemEditorOptions extends TaskItemOptions {
  // Nota dueña del editor: va en `noteIds` de las tareas creadas desde sus items.
  noteId: string;
  // Inyectable para tests; en la app devuelve `tasksStore`. Es una función y no
  // el store: `configure` mezcla opciones con mergeDeep y copiaría el objeto.
  getTaskStore: () => Store;
}

const taskItemSyncKey = new PluginKey<boolean>('taskItemSync');

/**
 * `TaskItemLinked` (mismo schema que el export) + lo que solo existe en el
 * editor: NodeView con "Crear tarea" / vínculo a /tasks y sync store → nodo.
 *
 * Direcciones (sin bucles): store → nodo lo hacen el listener del store y
 * `appendTransaction`; nodo → repo SOLO el handler del checkbox del NodeView.
 * Ningún cambio de atributo llama al repo, así una actualización del store
 * nunca vuelve a escribir la tarea.
 */
const TaskItemEditor = TaskItemLinked.extend<TaskItemEditorOptions, TaskItemSyncStorage>({
  addOptions() {
    return {
      ...(this.parent?.() as TaskItemOptions),
      noteId: '',
      getTaskStore: () => tasksStore,
    };
  },

  addStorage() {
    return { unsubscribe: null, localToggleDepth: 0 };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskItemNodeView);
  },

  addProseMirrorPlugins() {
    const lookup = createStoreTaskLookup(this.options.getTaskStore());
    return [
      new Plugin<boolean>({
        key: taskItemSyncKey,
        // "Puede haber items vinculados": se calcula una vez al crear el estado y
        // después solo mirando lo que cambió cada transacción. Es pegajosa (no
        // vuelve a false): es solo un atajo; sin items vinculados el recorrido de
        // `buildCheckedSyncTransaction` daría `null` de todos modos.
        state: {
          init: (_config, state) => docHasLinkedTaskItem(state.doc),
          apply: (tr, mayHaveLinked) =>
            mayHaveLinked || (tr.docChanged && transactionMayAddLinkedTaskItem(tr)),
        },
        // Un cambio del doc puede traer un item vinculado con `checked` viejo
        // (rehacer el vínculo, pegar un item copiado): se corrige en el acto.
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          if (transactions.every((tr) => tr.getMeta(TASK_SYNC_META) === true)) return null;
          if (!taskItemSyncKey.getState(newState)) return null;
          return buildCheckedSyncTransaction(newState, lookup);
        },
      }),
    ];
  },

  onCreate() {
    const store = this.options.getTaskStore();
    const lookup = createStoreTaskLookup(store);
    syncTaskItemsFromStore(this.editor, lookup);
    const listenerId = store.addTableListener('tasks', () => {
      syncTaskItemsFromStore(this.editor, lookup);
    });
    this.storage.unsubscribe = () => {
      store.delListener(listenerId);
    };
  },

  onDestroy() {
    this.storage.unsubscribe?.();
    this.storage.unsubscribe = null;
  },
});

export default TaskItemEditor;
