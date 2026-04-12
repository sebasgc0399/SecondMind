import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useRow } from 'tinybase/ui-react';
import NoteEditor from '@/components/editor/NoteEditor';
import BacklinksPanel, { BacklinksToggle } from '@/components/editor/BacklinksPanel';
import ReviewBanner from '@/components/editor/ReviewBanner';
import useNote from '@/hooks/useNote';
import useBacklinks from '@/hooks/useBacklinks';

function getInitialPanelState(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 1024px)').matches;
}

export default function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const row = useRow('notes', noteId ?? '');
  const { initialContent, isLoading, error, notFound } = useNote(noteId);
  const backlinks = useBacklinks(noteId);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(getInitialPanelState);

  const existsInStore = noteId && Object.keys(row).length > 0;

  useEffect(() => {
    if (!noteId) {
      navigate('/notes', { replace: true });
      return;
    }
    if (!isLoading && (notFound || !existsInStore)) {
      navigate('/notes', { replace: true });
    }
  }, [noteId, isLoading, notFound, existsInStore, navigate]);

  if (!noteId || isLoading || notFound || !existsInStore) {
    return <NoteEditorSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-180 px-4 py-8">
        <p className="text-sm text-destructive">Error al cargar la nota: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <div className="min-w-0 flex-1">
        <ReviewBanner noteId={noteId} />
        <NoteEditor
          key={noteId}
          noteId={noteId}
          initialContent={initialContent}
          headerSlot={
            !isPanelOpen ? (
              <BacklinksToggle count={backlinks.length} onClick={() => setIsPanelOpen(true)} />
            ) : null
          }
        />
      </div>
      {isPanelOpen && <BacklinksPanel noteId={noteId} onClose={() => setIsPanelOpen(false)} />}
    </div>
  );
}

function NoteEditorSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-3 px-4 py-6">
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  );
}
