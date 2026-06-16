import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState, type Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import {
  BetweenHorizontalStart,
  BetweenHorizontalEnd,
  BetweenVerticalStart,
  BetweenVerticalEnd,
  Rows3,
  Columns3,
  Trash2,
} from 'lucide-react';
import type { EditorState } from '@tiptap/pm/state';

// Solo cuando el cursor está DENTRO de una tabla y NO hay selección de texto: la
// selección de texto activa el BubbleToolbar de formato, así que exigir selección
// vacía hace los dos menús mutuamente exclusivos (sin doble menú superpuesto).
// La gestión de celdas seleccionadas (merge/split) llega en F4 con su propio caso.
function shouldShow({ editor, state }: { editor: Editor; state: EditorState }): boolean {
  if (!editor.isEditable) return false;
  if (!editor.isActive('table')) return false;
  if (!state.selection.empty) return false;
  return true;
}

interface TableToolbarProps {
  editor: Editor | null;
}

export default function TableToolbar({ editor }: TableToolbarProps) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      inTable: editor?.isActive('table') ?? false,
    }),
  });

  if (!editor || !state) return null;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableToolbar"
      shouldShow={shouldShow}
      options={{
        placement: 'top',
        offset: 8,
        flip: true,
        shift: { padding: 8 },
      }}
    >
      <div className="relative z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
        <TableButton
          onClick={() => editor.chain().focus().addRowBefore().run()}
          label={t('editor.table.addRowBefore', 'Insertar fila arriba')}
        >
          <BetweenHorizontalStart className="h-4 w-4" />
        </TableButton>
        <TableButton
          onClick={() => editor.chain().focus().addRowAfter().run()}
          label={t('editor.table.addRowAfter', 'Insertar fila abajo')}
        >
          <BetweenHorizontalEnd className="h-4 w-4" />
        </TableButton>
        <TableButton
          onClick={() => editor.chain().focus().deleteRow().run()}
          label={t('editor.table.deleteRow', 'Eliminar fila')}
          destructive
        >
          <Rows3 className="h-4 w-4" />
        </TableButton>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        <TableButton
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          label={t('editor.table.addColumnBefore', 'Insertar columna a la izquierda')}
        >
          <BetweenVerticalStart className="h-4 w-4" />
        </TableButton>
        <TableButton
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          label={t('editor.table.addColumnAfter', 'Insertar columna a la derecha')}
        >
          <BetweenVerticalEnd className="h-4 w-4" />
        </TableButton>
        <TableButton
          onClick={() => editor.chain().focus().deleteColumn().run()}
          label={t('editor.table.deleteColumn', 'Eliminar columna')}
          destructive
        >
          <Columns3 className="h-4 w-4" />
        </TableButton>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        <TableButton
          onClick={() => editor.chain().focus().deleteTable().run()}
          label={t('editor.table.deleteTable', 'Eliminar tabla')}
          destructive
        >
          <Trash2 className="h-4 w-4" />
        </TableButton>
      </div>
    </BubbleMenu>
  );
}

interface TableButtonProps {
  onClick: () => void;
  label: string;
  destructive?: boolean;
  children: React.ReactNode;
}

function TableButton({ onClick, label, destructive = false, children }: TableButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
        destructive
          ? 'text-foreground hover:bg-destructive/10 hover:text-destructive'
          : 'text-foreground hover:bg-accent/60'
      }`}
    >
      {children}
    </button>
  );
}
