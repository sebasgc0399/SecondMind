import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Wikilink from '@/components/editor/extensions/wikilink';
import SlashCommand from '@/components/editor/extensions/slash-command';
import WikilinkMenu from '@/components/editor/menus/WikilinkMenu';
import SlashMenu from '@/components/editor/menus/SlashMenu';
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
}

export default function NoteEditor({
  noteId,
  initialContent,
  initialSummaryL3,
  summaryIsOpen,
  onSummaryToggle,
  summaryTextareaRef,
  headerSlot,
}: NoteEditorProps) {
  const navigate = useNavigate();
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({ placeholder: 'Escribe una idea...' }),
      Wikilink,
      SlashCommand.configure({ noteId }),
    ],
    content: initialContent ?? undefined,
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
      <div className="mx-auto flex w-full max-w-180 items-center justify-end gap-3 px-4 py-3">
        {headerSlot}
        <SaveIndicator status={status} />
      </div>
      <SummaryL3
        value={summaryL3}
        onChange={setSummaryL3}
        textareaRef={summaryTextareaRef}
        isOpen={summaryIsOpen}
        onToggle={onSummaryToggle}
      />
      <div className="note-editor px-4" onClick={handleClick}>
        <EditorContent editor={editor} />
      </div>
      <WikilinkMenu />
      <SlashMenu />
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    return <span className="text-xs text-muted-foreground">Guardando...</span>;
  }
  if (status === 'saved') {
    return <span className="text-xs text-primary">✓ Guardado</span>;
  }
  return <span className="text-xs text-muted-foreground/60">Sin cambios</span>;
}
