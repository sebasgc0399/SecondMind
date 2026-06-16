import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Wikilink from '@/components/editor/extensions/wikilink';
import SlashCommand from '@/components/editor/extensions/slash-command';
import CodeBlockLowlight from '@/components/editor/extensions/code-block-lowlight';
import WikilinkMenu from '@/components/editor/menus/WikilinkMenu';
import SlashMenu from '@/components/editor/menus/SlashMenu';
import BubbleToolbar from '@/components/editor/menus/BubbleToolbar';
import TableToolbar from '@/components/editor/menus/TableToolbar';
import DistillLevelBanner from '@/components/editor/DistillLevelBanner';
import EditorSuggestionBanner from '@/components/editor/EditorSuggestionBanner';
import SaveErrorBanner from '@/components/editor/SaveErrorBanner';
import SummaryL3 from '@/components/editor/SummaryL3';
import useNoteSave, { type SaveStatus } from '@/hooks/useNoteSave';
import type { JSONContent } from '@tiptap/core';

interface NoteEditorProps {
  noteId: string;
  initialContent: JSONContent | null;
  initialSummaryL3: string;
  summaryIsOpen: boolean;
  onSummaryToggle: () => void;
  summaryTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  headerSlot?: React.ReactNode;
  onDiscardSaveError: () => void;
}

export default function NoteEditor({
  noteId,
  initialContent,
  initialSummaryL3,
  summaryIsOpen,
  onSummaryToggle,
  summaryTextareaRef,
  headerSlot,
  onDiscardSaveError,
}: NoteEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: 'https',
          HTMLAttributes: {
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'editor-link',
          },
        },
        underline: false,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      TableKit.configure({ table: { resizable: true } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CodeBlockLowlight,
      Placeholder.configure({ placeholder: t('editor.placeholder', 'Escribe una idea...') }),
      Wikilink.configure({ noteId }),
      SlashCommand.configure({ noteId }),
    ],
    content: initialContent ?? undefined,
    editorProps: {
      transformPastedHTML: (html) => html.replace(/\s(style|class)=["'][^"']*["']/gi, ''),
    },
  });

  const { status, summaryL3, setSummaryL3 } = useNoteSave(noteId, editor, initialSummaryL3);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const link = target.closest('[data-note-id]') as HTMLElement | null;
      if (!link) return;
      const targetId = link.getAttribute('data-note-id');
      if (!targetId || targetId === noteId) return;
      event.preventDefault();
      navigate(`/notes/${targetId}`);
    },
    [navigate, noteId],
  );

  return (
    <div className="flex flex-col">
      <div className="mx-auto flex w-full max-w-180 items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">{headerSlot}</div>
        <SaveIndicator status={status} />
      </div>
      <SummaryL3
        value={summaryL3}
        onChange={setSummaryL3}
        textareaRef={summaryTextareaRef}
        isOpen={summaryIsOpen}
        onToggle={onSummaryToggle}
      />
      <SaveErrorBanner noteId={noteId} onDiscard={onDiscardSaveError} />
      <DistillLevelBanner noteId={noteId} />
      <EditorSuggestionBanner noteId={noteId} />
      <div className="note-editor px-4" onClick={handleClick}>
        <EditorContent editor={editor} />
      </div>
      <WikilinkMenu noteId={noteId} />
      <SlashMenu />
      <BubbleToolbar editor={editor} />
      <TableToolbar editor={editor} />
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const { t } = useTranslation();
  if (status === 'saving') {
    return (
      <span className="text-xs text-muted-foreground">
        {t('editor.save.saving', 'Guardando...')}
      </span>
    );
  }
  if (status === 'retrying') {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400">
        {t('editor.save.retrying', 'Reintentando...')}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="text-xs text-destructive">{t('editor.save.error', 'Error al guardar')}</span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-primary">
        <Check className="h-3 w-3" aria-hidden />
        {t('editor.save.saved', 'Guardado')}
      </span>
    );
  }
  // idle: nada que sincronizar (sin entry en queue). Se oculta — mostrar "Sin
  // cambios" permanente es ruido. El estado "pendiente/offline" vive en el
  // indicador global <PendingSyncIndicator />, no acá.
  return null;
}
