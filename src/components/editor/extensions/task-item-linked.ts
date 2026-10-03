import TaskItem from '@tiptap/extension-task-item';

/**
 * Meta de una transacción que ya deja los items vinculados coherentes con
 * `tasksStore` (sync store → nodo, o toggle del usuario sobre un item
 * vinculado). El plugin de sync no le agrega correcciones (sin bucles).
 */
export const TASK_SYNC_META = 'taskItemSync';

/**
 * Meta nativa de TipTap (`Editor.dispatchTransaction`, @tiptap/core 3.26.1): con
 * `true` el editor NO emite `update`, así `useNoteSave` no agenda el autosave.
 * La usa el sync store → nodo: una ventana pasiva con la nota abierta no debe
 * reescribir su contenido (posiblemente viejo) solo porque la tarea cambió en
 * otro lado (E2-T4-b).
 */
export const SKIP_AUTOSAVE_META = 'preventUpdate';

/**
 * `TaskItem` con el atributo `taskId` (SPEC-71 T4): id de la tarea real de
 * `tasks/` vinculada al item, o `null` si es un checkbox local. Vive en el JSON
 * `content` de la nota (I2). Esta es la extensión de SCHEMA que comparten el
 * editor (que le suma NodeView y sync) y el export (I8).
 */
const TaskItemLinked = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      taskId: {
        default: null,
        // Enter al final de un item vinculado crea un item nuevo SIN vínculo.
        keepOnSplit: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-task-id') || null,
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.taskId === 'string' && attributes.taskId
            ? { 'data-task-id': attributes.taskId }
            : {},
      },
    };
  },
});

export function getTaskItemTaskId(attrs: Record<string, unknown>): string | null {
  const value = attrs.taskId;
  return typeof value === 'string' && value ? value : null;
}

export default TaskItemLinked;
