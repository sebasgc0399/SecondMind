import { AttrStep } from '@tiptap/pm/transform';
import {
  SKIP_AUTOSAVE_META,
  TASK_SYNC_META,
  getTaskItemTaskId,
} from '@/components/editor/extensions/task-item-linked';
import type { CreateTaskOptions } from '@/infra/repos/tasksRepo';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Store } from 'tinybase';

// Lógica de los items de tarea vinculados (SPEC-71 T4), sin React. La usan el
// plugin de sync del editor y el NodeView. El store se inyecta para testear.

export interface TaskLookup {
  exists: (taskId: string) => boolean;
  isCompleted: (taskId: string) => boolean;
}

export function createStoreTaskLookup(store: Store): TaskLookup {
  return {
    exists: (taskId) => store.hasRow('tasks', taskId),
    isCompleted: (taskId) => store.getCell('tasks', taskId, 'status') === 'completed',
  };
}

const TASK_ITEM = 'taskItem';

/** Storage de la extensión del editor (`editor.storage.taskItem`). */
export interface TaskItemSyncStorage {
  unsubscribe: (() => void) | null;
  // >0 mientras el checkbox de ESTE editor está escribiendo la tarea vía repo.
  localToggleDepth: number;
}

function getSyncStorage(editor: Editor): TaskItemSyncStorage | undefined {
  // Puede faltar si el editor se creó sin la extensión del editor (p. ej. tests).
  return (editor.storage as unknown as Record<string, TaskItemSyncStorage | undefined>)[TASK_ITEM];
}

/**
 * Transacción que pone `checked` de cada item vinculado igual al estado de su
 * tarea en el store, o `null` si ya coinciden. Los items cuya tarea no existe
 * (borrada, o el store todavía no hidrató) no se tocan: quedan como checkbox
 * local. Fuera del historial: deshacer no debe des-sincronizar el item.
 */
export function buildCheckedSyncTransaction(
  state: EditorState,
  lookup: TaskLookup,
): Transaction | null {
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== TASK_ITEM) return true;
    const taskId = getTaskItemTaskId(node.attrs);
    if (!taskId || !lookup.exists(taskId)) return true;
    const desired = lookup.isCompleted(taskId);
    if (node.attrs.checked !== desired) {
      tr ??= state.tr;
      tr.setNodeAttribute(pos, 'checked', desired);
    }
    return true;
  });
  if (!tr) return null;
  const sync = tr as Transaction;
  sync.setMeta('addToHistory', false);
  sync.setMeta(TASK_SYNC_META, true);
  return sync;
}

function isLinkedTaskItem(node: ProseMirrorNode): boolean {
  return node.type.name === TASK_ITEM && getTaskItemTaskId(node.attrs) !== null;
}

/** Recorre el doc entero; solo al crear el estado del plugin. */
export function docHasLinkedTaskItem(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (isLinkedTaskItem(node)) found = true;
    return !found;
  });
  return found;
}

/**
 * ¿Esta transacción pudo dejar un item vinculado en el doc? Mira solo los rangos
 * que cambió (en el doc final) y los `AttrStep` de `taskId` (p. ej. "Crear tarea",
 * deshacer/rehacer del vínculo), que no tienen rango en su mapa. Así, mientras la
 * nota no tenga items vinculados, el plugin de sync no recorre el doc en cada tecla.
 */
export function transactionMayAddLinkedTaskItem(tr: Transaction): boolean {
  const doc = tr.doc;
  let found = false;
  tr.steps.forEach((step, index) => {
    if (found) return;
    const after = tr.mapping.slice(index + 1);
    if (step instanceof AttrStep) {
      if (step.attr === 'taskId' && typeof step.value === 'string' && step.value) found = true;
      return;
    }
    step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (found) return;
      const from = Math.max(0, after.map(newStart, -1));
      const to = Math.min(doc.content.size, after.map(newEnd, 1));
      doc.nodesBetween(from, to, (node) => {
        if (found) return false;
        if (isLinkedTaskItem(node)) found = true;
        return !found;
      });
    });
  });
  return found;
}

/**
 * Store → nodo, disparado por un cambio del store (o al montar el editor). Si
 * el cambio vino de otro lado (/tasks, otra ventana, otro dispositivo) no
 * dispara el autosave (E2-T4-b): el contenido se guarda en el próximo cambio
 * real del usuario. Si lo causó el checkbox de este mismo editor, sí se guarda.
 */
export function syncTaskItemsFromStore(editor: Editor, lookup: TaskLookup): boolean {
  if (editor.isDestroyed) return false;
  const tr = buildCheckedSyncTransaction(editor.state, lookup);
  if (!tr) return false;
  const isLocalToggle = (getSyncStorage(editor)?.localToggleDepth ?? 0) > 0;
  if (!isLocalToggle) tr.setMeta(SKIP_AUTOSAVE_META, true);
  editor.view.dispatch(tr);
  return true;
}

export type TaskItemToggleResult = 'task' | 'unlinked' | 'local' | 'noop';

interface ToggleTaskItemArgs {
  editor: Editor;
  pos: number;
  checked: boolean;
  lookup: TaskLookup;
  // Con el store hidratando, "no existe" no significa "borrada": no se limpia el taskId.
  isHydrating: boolean;
  completeTask: (taskId: string) => Promise<void>;
}

/**
 * Checkbox → repo/nodo. Item vinculado a una tarea existente: la tarea se
 * completa/reabre vía repo (solo si su estado difiere, así un click repetido no
 * la alterna dos veces) y el nodo sigue al store. El repo es optimista y
 * actualiza `tasksStore` de forma síncrona (`setPartialRow` antes del primer
 * await), así el listener del store sincroniza el nodo dentro de esta llamada;
 * con `localToggleDepth` ese sync sí se guarda. El nodo nunca se adelanta al
 * store: si el repo no escribió (sin sesión), el checkbox vuelve atrás.
 * Vinculado a una tarea que ya no existe: vuelve a ser local y se limpia el
 * `taskId` en ese mismo cambio. Sin vínculo: toggle local normal (deshacible).
 */
export function toggleTaskItem({
  editor,
  pos,
  checked,
  lookup,
  isHydrating,
  completeTask,
}: ToggleTaskItemArgs): TaskItemToggleResult {
  if (!editor.isEditable || editor.isDestroyed) return 'noop';
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== TASK_ITEM) return 'noop';
  const taskId = getTaskItemTaskId(node.attrs);

  if (taskId && lookup.exists(taskId)) {
    if (lookup.isCompleted(taskId) !== checked) {
      const storage = getSyncStorage(editor);
      if (storage) storage.localToggleDepth += 1;
      try {
        void completeTask(taskId);
      } finally {
        if (storage) storage.localToggleDepth -= 1;
      }
    }
    // Por si el store no avisó (editor sin listener): el nodo queda igual al store.
    const tr = buildCheckedSyncTransaction(editor.state, lookup);
    if (tr) editor.view.dispatch(tr);
    return 'task';
  }

  const tr = editor.state.tr;
  if (taskId && !isHydrating) {
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked, taskId: null });
    editor.view.dispatch(tr);
    return 'unlinked';
  }
  tr.setNodeAttribute(pos, 'checked', checked);
  editor.view.dispatch(tr);
  return 'local';
}

/** Texto del item para nombrar la tarea: su primer párrafo (sin sub-items). */
export function getTaskItemText(editor: Editor, pos: number): string {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== TASK_ITEM) return '';
  return (node.firstChild?.textContent ?? '').trim();
}

export type CreateLinkedTaskResult = 'created' | 'noop' | 'error' | 'detached';

interface CreateLinkedTaskArgs {
  editor: Editor;
  getPos: () => number | undefined;
  noteId: string;
  lookup: TaskLookup;
  createTask: (name: string, options?: CreateTaskOptions) => Promise<string | null>;
}

function safePos(getPos: () => number | undefined): number | undefined {
  try {
    const pos = getPos();
    return typeof pos === 'number' ? pos : undefined;
  } catch {
    // El NodeView ya se destruyó (el item se borró durante el await).
    return undefined;
  }
}

/**
 * Botón "Crear tarea": crea la tarea vía repo con el texto del item y la nota
 * en `noteIds`, y guarda el `taskId` en el nodo en una transacción que SÍ va al
 * historial. Deshacer quita el vínculo (la tarea queda en /tasks); rehacer
 * restaura el MISMO `taskId`: la tarea solo se crea acá, nunca al rehacer.
 * `createTask` es optimista: el id existe antes del setDoc (offline).
 */
export async function createLinkedTask({
  editor,
  getPos,
  noteId,
  lookup,
  createTask,
}: CreateLinkedTaskArgs): Promise<CreateLinkedTaskResult> {
  if (!editor.isEditable || editor.isDestroyed) return 'noop';
  const pos = safePos(getPos);
  if (pos === undefined) return 'noop';
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== TASK_ITEM) return 'noop';
  const currentTaskId = getTaskItemTaskId(node.attrs);
  if (currentTaskId && lookup.exists(currentTaskId)) return 'noop';
  const text = getTaskItemText(editor, pos);
  if (!text) return 'noop';

  const taskId = await createTask(text, {
    noteIds: [noteId],
    ...(node.attrs.checked === true ? { status: 'completed' as const } : {}),
  });
  if (!taskId) return 'error';

  const nextPos = safePos(getPos);
  if (editor.isDestroyed || nextPos === undefined) return 'detached';
  const current = editor.state.doc.nodeAt(nextPos);
  if (!current || current.type.name !== TASK_ITEM) return 'detached';
  editor.view.dispatch(editor.state.tr.setNodeAttribute(nextPos, 'taskId', taskId));
  return 'created';
}
