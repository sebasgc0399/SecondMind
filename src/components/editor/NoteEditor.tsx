import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { JSONContent } from '@tiptap/core';
import Wikilink from '@/components/editor/extensions/wikilink';
import WikilinkMenu from '@/components/editor/menus/WikilinkMenu';
import useNoteSave, { type SaveStatus } from '@/hooks/useNoteSave';

interface NoteEditorProps {
  noteId: string;
  initialContent: JSONContent | null;
}

export default function NoteEditor({ noteId, initialContent }: NoteEditorProps) {
  const navigate = useNavigate();
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Escribe una idea...' }),
      Wikilink,
    ],
    content: initialContent ?? undefined,
  });

  const { status } = useNoteSave(noteId, editor);

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
      <div className="mx-auto flex w-full max-w-180 items-center justify-end px-4 py-3">
        <SaveIndicator status={status} />
      </div>
      <div className="note-editor px-4" onClick={handleClick}>
        <EditorContent editor={editor} />
      </div>
      <WikilinkMenu />
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
