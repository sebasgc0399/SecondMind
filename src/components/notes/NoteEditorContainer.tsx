import { useCallback, useEffect, useRef, useState } from 'react';
import NoteEditor from '@/components/editor/NoteEditor';
import BacklinksPanel, { BacklinksToggle } from '@/components/editor/BacklinksPanel';
import DistillIndicator from '@/components/editor/DistillIndicator';
import ReviewBanner from '@/components/editor/ReviewBanner';
import SimilarNotesPanel from '@/components/editor/SimilarNotesPanel';
import useNote from '@/hooks/useNote';
import useBacklinks from '@/hooks/useBacklinks';

interface NoteEditorContainerProps {
  noteId: string;
  // Cuando true, renderiza el panel lateral derecho con Backlinks + Similar.
  // F46.2: el SplitPaneLayout fuerza false cuando hay split activo para
  // evitar que el layout colapse a <250px por bloque (2 editores + handle
  // + panel lateral no caben en <1024px).
  showSidePanel: boolean;
}

function getInitialPanelState(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 1024px)').matches;
}

export default function NoteEditorContainer({ noteId, showSidePanel }: NoteEditorContainerProps) {
  const [discardCount, setDiscardCount] = useState(0);
  const { initialContent, initialSummaryL3, isLoading, error, notFound } = useNote(
    noteId,
    discardCount,
  );
  const backlinks = useBacklinks(noteId);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(getInitialPanelState);
  const [summaryIsOpen, setSummaryIsOpen] = useState<boolean>(
    () => initialSummaryL3.trim().length > 0,
  );
  const summaryTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleDiscardSaveError = useCallback(() => {
    setDiscardCount((prev) => prev + 1);
  }, []);

  // Auto-open summary cuando llega initialSummaryL3 post-getDoc (caso de nota
  // pre-existente con summaryL3 ya guardado). setState dentro de setTimeout
  // satisface la regla react-hooks/set-state-in-effect.
  useEffect(() => {
    if (initialSummaryL3.trim().length === 0) return;
    const id = window.setTimeout(() => setSummaryIsOpen(true), 0);
    return () => window.clearTimeout(id);
  }, [initialSummaryL3]);

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

  // El render del panel lateral solo si showSidePanel Y isPanelOpen del user.
  // Cuando showSidePanel pasa a false (split se abre), el panel se oculta sin
  // tocar isPanelOpen — al cerrar el split (showSidePanel vuelve a true), el
  // estado del user se restaura intacto.
  const renderSidePanel = showSidePanel && isPanelOpen;
  const renderBacklinksToggle = showSidePanel && !isPanelOpen;

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-180 flex-col gap-3 px-4 py-6">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-180 px-4 py-8">
        <p className="text-sm text-destructive">Error al cargar la nota: {error.message}</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-180 px-4 py-8">
        <p className="text-sm text-muted-foreground">Esta nota ya no existe.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <div className="min-w-0 flex-1">
        <ReviewBanner noteId={noteId} />
        <NoteEditor
          key={`${noteId}-${discardCount}`}
          noteId={noteId}
          initialContent={initialContent}
          initialSummaryL3={initialSummaryL3}
          summaryIsOpen={summaryIsOpen}
          onSummaryToggle={handleToggleSummary}
          summaryTextareaRef={summaryTextareaRef}
          onDiscardSaveError={handleDiscardSaveError}
          headerSlot={
            <>
              <DistillIndicator noteId={noteId} onOpenSummary={handleOpenSummary} />
              {renderBacklinksToggle && (
                <BacklinksToggle count={backlinks.length} onClick={() => setIsPanelOpen(true)} />
              )}
            </>
          }
        />
      </div>
      {renderSidePanel && (
        <div className="w-full lg:w-72 lg:shrink-0">
          <BacklinksPanel noteId={noteId} onClose={() => setIsPanelOpen(false)} />
          <SimilarNotesPanel noteId={noteId} />
        </div>
      )}
    </div>
  );
}
