import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import NoteEditor from '@/components/editor/NoteEditor';
import BacklinksPanel, { BacklinksToggle } from '@/components/editor/BacklinksPanel';
import DistillIndicator from '@/components/editor/DistillIndicator';
import ReviewBanner from '@/components/editor/ReviewBanner';
import SimilarNotesPanel from '@/components/editor/SimilarNotesPanel';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import useNote from '@/hooks/useNote';
import useBacklinks from '@/hooks/useBacklinks';

interface NoteEditorContainerProps {
  noteId: string;
  // Cuando true, renderiza el panel lateral derecho con Backlinks + Similar.
  // F46.2: el SplitPaneLayout fuerza false cuando hay split activo para
  // evitar que el layout colapse a <250px por bloque (2 editores + handle
  // + panel lateral no caben en <1024px).
  showSidePanel: boolean;
  // F46.6 fix discovery UX: cuando true, renderiza el botón Split en el
  // headerSlot del NoteEditor (junto a DistillIndicator/BacklinksToggle).
  // SplitPaneLayout pasa true al pane LEFT (single mode o split mode) y
  // false al pane RIGHT (que ya tiene su X en SplitPaneHeader). Cierra el
  // gap de discovery cuando el user tiene la sidebar visible (caso donde
  // el botón del TopBar NO es visible).
  showSplitButton: boolean;
}

function getInitialPanelState(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 1024px)').matches;
}

export default function NoteEditorContainer({
  noteId,
  showSidePanel,
  showSplitButton,
}: NoteEditorContainerProps) {
  const { t } = useTranslation();
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

  // F46.6: detección de split activo + toggle handler. Mismo patrón que
  // TopBar.tsx (dispatch event para abrir picker, URL manipulation para
  // cerrar). 3 callers ahora (TopBar + este + CommandPalette) — si emerge
  // un cuarto, extraer a `useSplitToggle` hook.
  const [searchParams, setSearchParams] = useSearchParams();
  const breakpoint = useBreakpoint();
  const splitOpen = searchParams.has('split');

  const handleDiscardSaveError = useCallback(() => {
    setDiscardCount((prev) => prev + 1);
  }, []);

  const handleSplitToggle = useCallback(() => {
    if (splitOpen) {
      const next = new URLSearchParams(searchParams);
      next.delete('split');
      setSearchParams(next, { replace: true });
    } else {
      window.dispatchEvent(new CustomEvent('secondmind:split-open-picker'));
    }
  }, [splitOpen, searchParams, setSearchParams]);

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
  const renderSplitButton = showSplitButton && breakpoint === 'desktop';

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
        <p className="text-sm text-destructive">
          {t('notes.detail.loadError', 'Error al cargar la nota: {{message}}', {
            message: error.message,
          })}
        </p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-180 px-4 py-8">
        <p className="text-sm text-muted-foreground">
          {t('notes.detail.notFound', 'Esta nota ya no existe.')}
        </p>
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
              {renderSplitButton && (
                <button
                  type="button"
                  onClick={handleSplitToggle}
                  aria-label={
                    splitOpen
                      ? t('commandPalette.closeSplit', 'Cerrar panel derecho')
                      : t('commandPalette.openSplit', 'Abrir nota lado a lado')
                  }
                  title={
                    splitOpen
                      ? t('notes.split.closeTitle', 'Cerrar panel derecho (⌘\\)')
                      : t('notes.split.openTitle', 'Abrir nota lado a lado (⌘\\)')
                  }
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {splitOpen ? (
                    <PanelRightClose className="h-4 w-4" aria-hidden />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" aria-hidden />
                  )}
                </button>
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
