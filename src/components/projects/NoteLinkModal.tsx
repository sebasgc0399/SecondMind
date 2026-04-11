import { useEffect, useMemo } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Search } from 'lucide-react';
import useNoteSearch from '@/hooks/useNoteSearch';

interface NoteLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (noteId: string) => void;
  excludeNoteIds: string[];
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  fleeting: 'Fugaz',
  literature: 'Literatura',
  permanent: 'Permanente',
};

const PARA_TYPE_LABELS: Record<string, string> = {
  project: 'Proyecto',
  area: 'Área',
  resource: 'Recurso',
  archive: 'Archivo',
};

export default function NoteLinkModal({
  open,
  onOpenChange,
  onPick,
  excludeNoteIds,
}: NoteLinkModalProps) {
  const { query, setQuery, results } = useNoteSearch();

  const excludeSet = useMemo(() => new Set(excludeNoteIds), [excludeNoteIds]);
  const filtered = useMemo(
    () => results.filter((r) => !excludeSet.has(r.id)),
    [results, excludeSet],
  );

  // Reset query al cerrar
  useEffect(() => {
    if (!open) setQuery('');
  }, [open, setQuery]);

  function handlePick(noteId: string) {
    onPick(noteId);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background-deep/80 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[90vw] max-w-lg max-h-[80vh] -translate-x-1/2 -translate-y-1/2 scale-100 flex-col overflow-hidden rounded-2xl border border-border-strong bg-card p-6 opacity-100 shadow-[0_20px_40px_rgba(0,0,0,0.5)] outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Title className="text-lg font-semibold text-foreground">
            Vincular nota
          </Dialog.Title>

          <div className="relative mt-4">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar notas..."
              autoFocus
              className="w-full rounded-md border border-border bg-background py-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {query.trim() ? 'Sin resultados' : 'Sin notas disponibles para vincular'}
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
                          {note.title || 'Sin título'}
                        </h4>
                        {snippet && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {snippet}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium uppercase tracking-wide">
                            {NOTE_TYPE_LABELS[note.noteType] ?? note.noteType}
                          </span>
                          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium uppercase tracking-wide">
                            {PARA_TYPE_LABELS[note.paraType] ?? note.paraType}
                          </span>
                        </div>
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
