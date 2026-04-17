import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useRow } from 'tinybase/ui-react';
import NoteEditor from '@/components/editor/NoteEditor';
import BacklinksPanel, { BacklinksToggle } from '@/components/editor/BacklinksPanel';
import DistillIndicator from '@/components/editor/DistillIndicator';
import ReviewBanner from '@/components/editor/ReviewBanner';
import SimilarNotesPanel from '@/components/editor/SimilarNotesPanel';
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
  const { initialContent, initialSummaryL3, isLoading, error, notFound } = useNote(noteId);
  const backlinks = useBacklinks(noteId);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(getInitialPanelState);
  const [summaryIsOpen, setSummaryIsOpen] = useState<boolean>(
    () => initialSummaryL3.trim().length > 0,
  );
  const summaryTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Si el usuario llega a una nota que ya tiene summaryL3 guardado, auto-open
  // el colapsable. initialSummaryL3 puede cambiar despues del primer render
  // (getDoc async), por eso el effect.
  useEffect(() => {
    if (initialSummaryL3.trim().length > 0) setSummaryIsOpen(true);
  }, [initialSummaryL3]);

  // Al clickear "Escribir resumen L3" desde el popover: expandir el colapsable
  // y enfocar el textarea. Si estaba colapsado, el textarea no existe en DOM
  // todavia; rAF espera el render para que .focus() tenga efecto.
  const handleOpenSummary = useCallback(() => {
    setSummaryIsOpen(true);
    requestAnimationFrame(() => {
      const el = summaryTextareaRef.current;
      if (!el) return;
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  const handleToggleSummary = useCallback(() => {
    setSummaryIsOpen((prev) => !prev);
  }, []);

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
          initialSummaryL3={initialSummaryL3}
          summaryIsOpen={summaryIsOpen}
          onSummaryToggle={handleToggleSummary}
          summaryTextareaRef={summaryTextareaRef}
          headerSlot={
            <>
              <DistillIndicator noteId={noteId} onOpenSummary={handleOpenSummary} />
              {!isPanelOpen && (
                <BacklinksToggle count={backlinks.length} onClick={() => setIsPanelOpen(true)} />
              )}
            </>
          }
        />
      </div>
      {isPanelOpen && (
        <div className="w-full lg:w-72 lg:shrink-0">
          <BacklinksPanel noteId={noteId} onClose={() => setIsPanelOpen(false)} />
          <SimilarNotesPanel noteId={noteId} />
        </div>
      )}
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
