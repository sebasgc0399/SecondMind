import { useEffect, useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Highlighter,
  Link as LinkIcon,
  ExternalLink,
  Pencil,
  Unlink,
} from 'lucide-react';
import LinkInput from '@/components/editor/menus/LinkInput';
import type { EditorState } from '@tiptap/pm/state';

function shouldShow({ editor, state }: { editor: Editor; state: EditorState }): boolean {
  if (!editor.isEditable) return false;
  if (editor.isActive('codeBlock')) return false;
  if (editor.isActive('wikilink')) return false;
  if (state.selection.empty && !editor.isActive('link')) return false;
  return true;
}

type ToolbarMode = 'default' | 'link-edit';

interface BubbleToolbarProps {
  editor: Editor | null;
}

export default function BubbleToolbar({ editor }: BubbleToolbarProps) {
  const [mode, setMode] = useState<ToolbarMode>('default');

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      isBold: editor?.isActive('bold') ?? false,
      isItalic: editor?.isActive('italic') ?? false,
      isStrike: editor?.isActive('strike') ?? false,
      isCode: editor?.isActive('code') ?? false,
      isHighlight: editor?.isActive('highlight') ?? false,
      isLink: editor?.isActive('link') ?? false,
      linkHref: (editor?.getAttributes('link').href as string | undefined) ?? '',
      selectionEmpty: editor?.state.selection.empty ?? true,
    }),
  });

  useEffect(() => {
    if (!state) return;
    if (!state.isLink && state.selectionEmpty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset de mode cuando la selección/link cambia externamente. Backlog
      setMode('default');
    }
  }, [state]);

  if (!editor || !state) return null;

  const applyLink = (href: string) => {
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setMode('default');
  };

  const unlinkCurrent = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setMode('default');
  };

  const openLink = (href: string) => {
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  const showLinkHover = state.selectionEmpty && state.isLink && mode === 'default';

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
      {mode === 'link-edit' ? (
        <LinkInput
          initialUrl={state.linkHref}
          onConfirm={applyLink}
          onCancel={() => setMode('default')}
          onUnlink={state.isLink ? unlinkCurrent : undefined}
        />
      ) : showLinkHover ? (
        <LinkHoverView
          href={state.linkHref}
          onEdit={() => setMode('link-edit')}
          onOpen={() => openLink(state.linkHref)}
          onUnlink={unlinkCurrent}
        />
      ) : (
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
          <ToolbarButton
            active={state.isBold}
            onClick={() => editor.chain().focus().toggleBold().run()}
            label="Negrita"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={state.isItalic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            label="Cursiva"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={state.isStrike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            label="Tachado"
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={state.isCode}
            onClick={() => editor.chain().focus().toggleCode().run()}
            label="Código inline"
          >
            <Code className="h-4 w-4" />
          </ToolbarButton>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
          <ToolbarButton
            active={state.isHighlight}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            label="Resaltar"
          >
            <Highlighter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton active={state.isLink} onClick={() => setMode('link-edit')} label="Link">
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}
    </BubbleMenu>
  );
}

interface LinkHoverViewProps {
  href: string;
  onEdit: () => void;
  onOpen: () => void;
  onUnlink: () => void;
}

function LinkHoverView({ href, onEdit, onOpen, onUnlink }: LinkHoverViewProps) {
  const displayHref = truncateHref(href);
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
      <span
        title={href}
        className="inline-flex h-11 max-w-56 items-center truncate px-3 text-sm text-muted-foreground"
      >
        {displayHref}
      </span>
      <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
      <button
        type="button"
        onClick={onOpen}
        aria-label="Abrir link en nueva pestaña"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent/60"
      >
        <ExternalLink className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label="Editar link"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent/60"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onUnlink}
        aria-label="Desvincular"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent/60"
      >
        <Unlink className="h-4 w-4" />
      </button>
    </div>
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

function truncateHref(href: string, max = 32): string {
  if (!href) return '';
  const stripped = href.replace(/^https?:\/\//i, '');
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max - 1) + '…';
}
