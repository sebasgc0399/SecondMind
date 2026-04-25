import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTable } from 'tinybase/ui-react';
import { rowToOramaDoc, type NoteOramaDoc } from '@/lib/orama';
import { formatRelative } from '@/lib/formatDate';
import { useStoreHydration } from '@/hooks/useStoreHydration';

const RECENT_LIMIT = 5;

export default function RecentNotesCard() {
  const table = useTable('notes');
  const { isHydrating } = useStoreHydration();

  const recent = useMemo<NoteOramaDoc[]>(() => {
    return Object.entries(table)
      .map(([id, row]) => rowToOramaDoc(id, row))
      .filter((doc) => !doc.isArchived && doc.deletedAt === 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, RECENT_LIMIT);
  }, [table]);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">📝 Notas recientes</h2>
        {recent.length > 0 && (
          <Link
            to="/notes"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver todas →
          </Link>
        )}
      </header>

      {isHydrating && recent.length === 0 ? (
        <CardSkeleton rows={4} />
      ) : recent.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((note) => (
            <li key={note.id}>
              <RecentNoteItem note={note} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentNoteItem({ note }: { note: NoteOramaDoc }) {
  return (
    <Link
      to={`/notes/${note.id}`}
      className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {note.title}
      </span>
      <span className="flex-shrink-0 text-[11px] text-muted-foreground">
        {formatRelative(note.updatedAt)}
      </span>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">No tenés notas todavía.</p>
      <Link
        to="/notes"
        className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
      >
        Crear primera nota →
      </Link>
    </div>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-2 py-1.5">
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
