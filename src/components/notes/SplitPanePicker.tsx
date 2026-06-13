import { useEffect, useMemo } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useNoteSearch from '@/hooks/useNoteSearch';

interface SplitPanePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentNoteId: string;
  onSelect: (noteId: string) => void;
}

// Modal picker para elegir la segunda nota del split. Reusa useNoteSearch
// (Orama FTS sobre title + contentPlain, ya en stack). Excluye la nota
// actual del pane izquierdo para evitar same-note split (D2 del SPEC).
//
// Patrón base-ui/dialog canónico (refs: NoteLinkModal.tsx, ObjectiveCreateModal.tsx)
// con animación data-starting-style / data-ending-style (memoria
// feedback_baseui_data_attributes — NO usar animate-in clases de
// tw-animate-css, no aplican a base-ui).
export default function SplitPanePicker({
  open,
  onOpenChange,
  currentNoteId,
  onSelect,
}: SplitPanePickerProps) {
  const { t } = useTranslation();
  const { query, setQuery, results } = useNoteSearch();

  const filtered = useMemo(
    () => results.filter((r) => r.id !== currentNoteId),
    [results, currentNoteId],
  );

  // Reset query al cerrar — UX cleaner cuando el user reabre el picker.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open, setQuery]);

  function handlePick(noteId: string) {
    onSelect(noteId);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background-deep/80 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 scale-100 flex-col overflow-hidden rounded-2xl border border-border-strong bg-card p-6 opacity-100 shadow-modal outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Title className="text-lg font-semibold text-foreground">
            {t('commandPalette.openSplit', 'Abrir nota lado a lado')}
          </Dialog.Title>

          <div className="relative mt-4">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(
                'notes.split.searchPlaceholder',
                'Buscar nota para abrir lado a lado...',
              )}
              autoFocus
              className="w-full rounded-md border border-border bg-background py-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {query.trim()
                  ? t('editor.menu.noResults', 'Sin resultados')
                  : t('notes.split.noOtherNotes', 'Sin otras notas disponibles')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {filtered.map((note) => {
                  const snippet = note.contentPlain.trim().slice(0, 120);
                  return (
                    <li key={note.id}>
                      <button
                        type="button"
                        onClick={() => handlePick(note.id)}
                        className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-border/80 hover:bg-accent/40"
                      >
                        <h4 className="text-sm font-medium text-foreground">
                          {note.title || t('common.untitled', 'Sin título')}
                        </h4>
                        {snippet && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {snippet}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
