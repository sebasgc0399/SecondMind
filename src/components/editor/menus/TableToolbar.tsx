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
  PanelTop,
  PanelLeft,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Combine,
  Trash2,
} from 'lucide-react';
import { CellSelection } from '@tiptap/pm/tables';
import type { EditorState } from '@tiptap/pm/state';

// Cuándo mostrar el menú de tabla, coordinado con el BubbleToolbar de formato:
//   - CellSelection (celdas seleccionadas) → mostrar (caso merge de F4).
//   - Selección de TEXTO dentro de una celda → ocultar, le cede el paso al
//     BubbleToolbar de formato (que a su vez excluye CellSelection).
//   - Cursor en celda sin selección → mostrar (gestión + split de celda merged).
function shouldShow({ editor, state }: { editor: Editor; state: EditorState }): boolean {
  if (!editor.isEditable) return false;
  if (!editor.isActive('table')) return false;
  if (state.selection instanceof CellSelection) return true;
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
      alignLeft: editor?.isActive({ textAlign: 'left' }) ?? false,
      alignCenter: editor?.isActive({ textAlign: 'center' }) ?? false,
      alignRight: editor?.isActive({ textAlign: 'right' }) ?? false,
      canMergeOrSplit: editor?.can().mergeOrSplit() ?? false,
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
      {/* z-50: el wrapper flotante del BubbleMenu es z-auto y ningún ancestro crea
          stacking context, así que sin esto el sidebar (z-30) tapa el menú e
          intercepta los clics cuando se solapan (tabla cerca del borde izquierdo). */}
      <div className="relative z-50 flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
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
        <Divider />
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
        <Divider />
        <TableButton
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          label={t('editor.table.toggleHeaderRow', 'Fila de encabezado')}
        >
          <PanelTop className="h-4 w-4" />
        </TableButton>
        <TableButton
          onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
          label={t('editor.table.toggleHeaderColumn', 'Columna de encabezado')}
        >
          <PanelLeft className="h-4 w-4" />
        </TableButton>
        <Divider />
        <TableButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          label={t('editor.table.alignLeft', 'Alinear a la izquierda')}
          active={state.alignLeft}
        >
          <AlignLeft className="h-4 w-4" />
        </TableButton>
        <TableButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          label={t('editor.table.alignCenter', 'Centrar')}
          active={state.alignCenter}
        >
          <AlignCenter className="h-4 w-4" />
        </TableButton>
        <TableButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          label={t('editor.table.alignRight', 'Alinear a la derecha')}
          active={state.alignRight}
        >
          <AlignRight className="h-4 w-4" />
        </TableButton>
        <Divider />
        <TableButton
          onClick={() => editor.chain().focus().mergeOrSplit().run()}
          label={t('editor.table.mergeOrSplit', 'Combinar o dividir celdas')}
          disabled={!state.canMergeOrSplit}
        >
          <Combine className="h-4 w-4" />
        </TableButton>
        <Divider />
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

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

interface TableButtonProps {
  onClick: () => void;
  label: string;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

function TableButton({
  onClick,
  label,
  active,
  destructive = false,
  disabled = false,
  children,
}: TableButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        active
          ? 'bg-accent text-accent-foreground'
          : destructive
          ? 'text-foreground hover:bg-destructive/10 hover:text-destructive'
          : 'text-foreground hover:bg-accent/60'
      }`}
    >
      {children}
    </button>
  );
}
