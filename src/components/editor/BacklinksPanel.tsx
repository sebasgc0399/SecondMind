import { Link } from 'react-router';
import { Link2, X } from 'lucide-react';
import useBacklinks from '@/hooks/useBacklinks';

interface BacklinksPanelProps {
  noteId: string;
  onClose: () => void;
}

export default function BacklinksPanel({ noteId, onClose }: BacklinksPanelProps) {
  const backlinks = useBacklinks(noteId);

  return (
    <aside className="w-full rounded-lg border border-border bg-card lg:w-72 lg:flex-shrink-0">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Backlinks <span className="text-muted-foreground">({backlinks.length})</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Ocultar backlinks"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {backlinks.length === 0 ? (
        <div className="px-4 py-6">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sin backlinks aún. Las notas que enlacen a esta aparecerán acá.
          </p>
        </div>
      ) : (
        <ul className="max-h-[calc(100vh-12rem)] overflow-y-auto">
          {backlinks.map((backlink) => (
            <li key={backlink.linkId} className="border-b border-border last:border-b-0">
              <Link
                to={`/notes/${backlink.sourceId}`}
                className="block px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {backlink.sourceTitle}
                </p>
                {backlink.context && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {backlink.context}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

interface BacklinksToggleProps {
  count: number;
  onClick: () => void;
}

export function BacklinksToggle({ count, onClick }: BacklinksToggleProps) {
  // Mismo patrón de chip que DistillIndicator: pill visual chico dentro de un
  // contenedor de 44px de alto (tap target). Los dos chips de la fila de
  // metadata (L1 + Backlinks) se leen como un grupo homogéneo.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Backlinks (${count})`}
      className="inline-flex h-11 items-center justify-center rounded-full px-1 outline-none transition-colors hover:bg-accent/40 motion-safe:active:scale-95"
    >
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground">
        <Link2 className="h-3 w-3" aria-hidden />
        Backlinks ({count})
      </span>
    </button>
  );
}
