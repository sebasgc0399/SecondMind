import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useRow } from 'tinybase/ui-react';
import NoteEditor from '@/components/editor/NoteEditor';
import BacklinksPanel, { BacklinksToggle } from '@/components/editor/BacklinksPanel';
import DistillIndicator from '@/components/editor/DistillIndicator';
import ReviewBanner from '@/components/editor/ReviewBanner';
import SimilarNotesPanel from '@/components/editor/SimilarNotesPanel';
import useNote from '@/hooks/useNote';
import useBacklinks from '@/hooks/useBacklinks';
import { saveNotesCreatesQueue } from '@/lib/saveQueue';

// Estable a nivel módulo para useSyncExternalStore (evita re-suscripciones).
const subscribeToCreatesQueue = (cb: () => void): (() => void) =>
  saveNotesCreatesQueue.subscribe(cb);

function getInitialPanelState(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 1024px)').matches;
}

export default function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const row = useRow('notes', noteId ?? '');
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

  // discardCount NO se resetea al cambiar de nota — cuando noteId cambia, el
  // sufijo de `key={`${noteId}-${discardCount}`}` cambia igual (porque noteId
  // es parte de la key), forzando re-mount limpio del editor sin importar el
  // valor de discardCount. El counter solo crece, no rompe semántica.
  const handleDiscardSaveError = useCallback(() => {
    setDiscardCount((prev) => prev + 1);
  }, []);

  // Si el usuario llega a una nota que ya tiene summaryL3 guardado, auto-open
  // el colapsable. initialSummaryL3 puede cambiar despues del primer render
  // (getDoc async), por eso el effect. setState va dentro de setTimeout para
  // pasar la regla react-hooks/set-state-in-effect.
  useEffect(() => {
    if (initialSummaryL3.trim().length === 0) return;
    const id = window.setTimeout(() => setSummaryIsOpen(true), 0);
    return () => window.clearTimeout(id);
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

  // F30.4 G3': cross-check con saveNotesCreatesQueue para tolerar la ventana
  // entre createNote() retorna el id y el flush termina. Sin esto, getDoc
  // (notFound) o un onSnapshot post-error (que borra la row local, G6)
  // dispararían un redirect erróneo aunque el create esté pending o el
  // usuario pueda reintentar desde el indicator.
  const getCreateEntry = useCallback(
    () => (noteId ? saveNotesCreatesQueue.getEntry(noteId) : undefined),
    [noteId],
  );
  const createEntry = useSyncExternalStore(subscribeToCreatesQueue, getCreateEntry);
  const isCreatePending = createEntry !== undefined && createEntry.status !== 'synced';

  useEffect(() => {
    if (!noteId) {
      navigate('/notes', { replace: true });
      return;
    }
    if (!isLoading && (notFound || !existsInStore) && !isCreatePending) {
      navigate('/notes', { replace: true });
    }
  }, [noteId, isLoading, notFound, existsInStore, navigate, isCreatePending]);

  if (!noteId || isLoading || ((notFound || !existsInStore) && !isCreatePending)) {
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
