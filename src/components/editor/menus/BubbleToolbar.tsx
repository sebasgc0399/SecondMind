import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState, type Editor } from '@tiptap/react';
import { Bold, Italic, Strikethrough, Code, Highlighter } from 'lucide-react';
import type { EditorState } from '@tiptap/pm/state';

// Commit 3 extiende: permitir selection.empty cuando cursor está sobre link
// (para mini-toolbar edit/unlink/open).
function shouldShow({ editor, state }: { editor: Editor; state: EditorState }): boolean {
  if (!editor.isEditable) return false;
  if (state.selection.empty) return false;
  if (editor.isActive('codeBlock')) return false;
  if (editor.isActive('wikilink')) return false;
  return true;
}

interface BubbleToolbarProps {
  editor: Editor | null;
}

export default function BubbleToolbar({ editor }: BubbleToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      isBold: editor?.isActive('bold') ?? false,
      isItalic: editor?.isActive('italic') ?? false,
      isStrike: editor?.isActive('strike') ?? false,
      isCode: editor?.isActive('code') ?? false,
      isHighlight: editor?.isActive('highlight') ?? false,
    }),
  });

  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="bubbleToolbar"
      shouldShow={shouldShow}
      options={{
        placement: 'top',
        offset: 8,
        flip: true,
        shift: { padding: 8 },
      }}
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
        <ToolbarButton
          active={state?.isBold ?? false}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Negrita"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={state?.isItalic ?? false}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Cursiva"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={state?.isStrike ?? false}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          label="Tachado"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={state?.isCode ?? false}
          onClick={() => editor.chain().focus().toggleCode().run()}
          label="Código inline"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        <ToolbarButton
          active={state?.isHighlight ?? false}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          label="Resaltar"
        >
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </BubbleMenu>
  );
}

interface ToolbarButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({ active, onClick, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
        active ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/60'
      }`}
    >
      {children}
    </button>
  );
}
