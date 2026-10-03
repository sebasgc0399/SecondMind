import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useHasRow } from 'tinybase/ui-react';
import { getTaskItemTaskId } from '@/components/editor/extensions/task-item-linked';
import {
  createLinkedTask,
  createStoreTaskLookup,
  toggleTaskItem,
} from '@/components/editor/extensions/task-item-sync';
import { tasksRepo } from '@/infra/repos/tasksRepo';
import { useStoreHydration } from '@/hooks/useStoreHydration';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Store } from 'tinybase';

interface UseTaskItemLinkArgs {
  editor: Editor;
  node: ProseMirrorNode;
  getPos: () => number | undefined;
  noteId: string;
  taskStore: Store;
}

interface UseTaskItemLinkReturn {
  isChecked: boolean;
  // Vinculado a una tarea que existe en el store: muestra el acceso a /tasks.
  isLinked: boolean;
  // "Crear tarea" disponible: editable, con texto y sin tarea viva vinculada.
  canCreate: boolean;
  isEditable: boolean;
  // El último "Crear tarea" falló; se limpia solo tras CREATE_ERROR_MS.
  hasCreateError: boolean;
  handleToggle: (checked: boolean) => void;
  handleCreate: () => Promise<void>;
}

// Mismo tiempo que el aviso de "Convertir en nota" (useConvertNotice).
export const CREATE_ERROR_MS = 3000;

// `setEditable` no despacha transacciones (solo emite `update`): se escucha
// ese evento para que el botón desaparezca en modo solo-lectura.
function useEditorIsEditable(editor: Editor): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      editor.on('update', onChange);
      return () => {
        editor.off('update', onChange);
      };
    },
    [editor],
  );
  const getSnapshot = useCallback(() => !editor.isDestroyed && editor.isEditable, [editor]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

function readPos(getPos: () => number | undefined): number | undefined {
  try {
    const pos = getPos();
    return typeof pos === 'number' ? pos : undefined;
  } catch {
    return undefined;
  }
}

export default function useTaskItemLink({
  editor,
  node,
  getPos,
  noteId,
  taskStore,
}: UseTaskItemLinkArgs): UseTaskItemLinkReturn {
  const taskId = getTaskItemTaskId(node.attrs);
  const exists = useHasRow('tasks', taskId ?? '', taskStore);
  const { isHydrating } = useStoreHydration();
  const isEditable = useEditorIsEditable(editor);
  const lookup = useMemo(() => createStoreTaskLookup(taskStore), [taskStore]);
  const isBusyRef = useRef(false);
  // Cada fallo es un evento nuevo: reinicia el timer aunque el aviso ya esté visible.
  const [createErrorId, setCreateErrorId] = useState(0);

  useEffect(() => {
    if (createErrorId === 0) return;
    const timer = setTimeout(() => setCreateErrorId(0), CREATE_ERROR_MS);
    return () => clearTimeout(timer);
  }, [createErrorId]);

  const isLinked = Boolean(taskId) && exists;
  const hasText = (node.firstChild?.textContent ?? '').trim().length > 0;
  // Con taskId de una tarea que ya no existe (y el store hidratado) el item es
  // local otra vez: puede volver a crear su tarea.
  const canCreate = isEditable && hasText && (!taskId || (!exists && !isHydrating));

  const handleToggle = useCallback(
    (checked: boolean) => {
      const pos = readPos(getPos);
      if (pos === undefined) return;
      toggleTaskItem({
        editor,
        pos,
        checked,
        lookup,
        isHydrating,
        completeTask: tasksRepo.completeTask,
      });
    },
    [editor, getPos, lookup, isHydrating],
  );

  const handleCreate = useCallback(async () => {
    // Doble click durante el await: una sola tarea.
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    try {
      const result = await createLinkedTask({
        editor,
        getPos,
        noteId,
        lookup,
        createTask: tasksRepo.createTask,
      });
      if (result === 'error') setCreateErrorId((id) => id + 1);
      else setCreateErrorId(0);
    } finally {
      isBusyRef.current = false;
    }
  }, [editor, getPos, noteId, lookup]);

  return {
    isChecked: node.attrs.checked === true,
    isLinked,
    canCreate,
    isEditable,
    hasCreateError: createErrorId > 0,
    handleToggle,
    handleCreate,
  };
}
