import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useNavigate } from 'react-router';
import { ListChecks, ListPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useTaskItemLink from '@/hooks/useTaskItemLink';
import type { TaskItemEditorOptions } from '@/components/editor/extensions/task-item-editor';

// Mismo DOM que el NodeView nativo de TaskItem (li > label + div) para que el CSS
// existente de `.note-editor ul[data-type='taskList']` siga aplicando; las
// acciones van en un <span> para no matchear `li > div`. Son <button> con el
// ícono sin pointer-events: así el target del mousedown es un BUTTON y el
// NodeView de TipTap (`stopEvent`) no deja que ProseMirror lo trate como un
// click de selección sobre el item.
export default function TaskItemNodeView({ node, editor, getPos, extension }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const options = extension.options as TaskItemEditorOptions;
  const { isChecked, isLinked, canCreate, isEditable, hasCreateError, handleToggle, handleCreate } =
    useTaskItemLink({
      editor,
      node,
      getPos,
      noteId: options.noteId,
      taskStore: options.getTaskStore(),
    });
  const taskId = (node.attrs.taskId as string | null) ?? undefined;
  // El lector de pantalla nombra la tarea; sin texto, el label genérico.
  const itemName = (node.firstChild?.textContent ?? '').trim();
  const checkboxLabel = itemName
    ? isChecked
      ? t('editor.task.markPendingAria', { name: itemName })
      : t('editor.task.completeAria', { name: itemName })
    : isChecked
    ? t('tasks.card.markPendingAria', 'Marcar pendiente')
    : t('tasks.card.completeAria', 'Completar tarea');

  return (
    <NodeViewWrapper
      as="li"
      data-type="taskItem"
      data-checked={isChecked ? 'true' : 'false'}
      data-task-id={taskId}
    >
      <label contentEditable={false}>
        <input
          type="checkbox"
          checked={isChecked}
          // Igual que el NodeView nativo: el mousedown no mueve la selección.
          onMouseDown={(event) => event.preventDefault()}
          onChange={(event) => handleToggle(event.target.checked)}
          disabled={!isEditable}
          aria-label={checkboxLabel}
        />
        <span />
      </label>
      <NodeViewContent as="div" />
      {hasCreateError ? (
        <span
          contentEditable={false}
          role="alert"
          className="task-item-error self-center text-xs text-destructive"
        >
          {t('editor.task.createError')}
        </span>
      ) : null}
      {isLinked ? (
        <span contentEditable={false} className="task-item-linked">
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            aria-label={t('editor.task.linked', 'Vinculada a Tareas')}
            title={t('editor.task.linked', 'Vinculada a Tareas')}
            className="relative inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-accent hover:text-foreground"
          >
            <ListChecks className="pointer-events-none h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ) : null}
      {canCreate ? (
        <span contentEditable={false} className="task-item-action">
          <button
            type="button"
            onClick={() => void handleCreate()}
            aria-label={t('editor.task.createTask', 'Crear tarea')}
            title={t('editor.task.createTask', 'Crear tarea')}
            className="relative inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-accent hover:text-foreground"
          >
            <ListPlus className="pointer-events-none h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ) : null}
    </NodeViewWrapper>
  );
}
