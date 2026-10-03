import TaskItem from '@tiptap/extension-task-item';
import type { Editor } from '@tiptap/core';

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
  addKeyboardShortcuts() {
    const parent = this.parent?.() ?? {};
    return {
      ...parent,
      Enter: () =>
        splitLinkedTaskItemAtStart(this.editor, this.name) ||
        (parent.Enter?.({ editor: this.editor }) ?? false),
    };
  },

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

/**
 * Enter con el cursor al INICIO de un item vinculado con texto: `splitListItem`
 * deja los attrs en el nodo de arriba (el vacío), así el vínculo quedaría en el
 * item vacío y el texto sin vínculo. Acá se hace el mismo split y, en la MISMA
 * transacción (un solo paso de deshacer), `taskId` y `checked` pasan al item de
 * abajo (el que conserva el texto); el de arriba queda local y sin marcar.
 * Devuelve `false` en cualquier otro caso (el Enter heredado decide).
 */
function splitLinkedTaskItemAtStart(editor: Editor, typeName: string): boolean {
  const { selection } = editor.state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if ($from.depth < 2 || $from.parentOffset !== 0) return false;
  if ($from.parent.content.size === 0) return false;
  const item = $from.node(-1);
  // El cursor debe estar en el primer párrafo del item (no en un hijo anidado).
  if (item.type.name !== typeName || $from.index(-1) !== 0) return false;
  const taskId = getTaskItemTaskId(item.attrs);
  if (!taskId) return false;
  if (!editor.can().splitListItem(typeName)) return false;

  const itemPos = $from.before(-1);
  const checked = item.attrs.checked === true;
  editor
    .chain()
    .splitListItem(typeName)
    .command(({ tr }) => {
      const upper = tr.doc.nodeAt(itemPos);
      if (!upper || upper.type.name !== typeName) return false;
      const lowerPos = itemPos + upper.nodeSize;
      const lower = tr.doc.nodeAt(lowerPos);
      if (!lower || lower.type.name !== typeName) return false;
      tr.setNodeMarkup(itemPos, undefined, { ...upper.attrs, taskId: null, checked: false });
      tr.setNodeMarkup(lowerPos, undefined, { ...lower.attrs, taskId, checked });
      return true;
    })
    .run();
  // El split ya se despachó: devolver `true` evita que el Enter heredado vuelva a partir.
  return true;
}

export default TaskItemLinked;
