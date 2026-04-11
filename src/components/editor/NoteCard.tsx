import { Link } from 'react-router';
import { Link2 } from 'lucide-react';
import type { NoteOramaDoc } from '@/lib/orama';

interface NoteCardProps {
  note: NoteOramaDoc;
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

export default function NoteCard({ note }: NoteCardProps) {
  const snippet = note.contentPlain.trim().slice(0, 200);
  const showSnippet = snippet.length > 0;

  return (
    <Link
      to={`/notes/${note.id}`}
      className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-accent/40"
    >
      <h2 className="truncate text-base font-semibold text-foreground">{note.title}</h2>
      {showSnippet && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{snippet}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge>{NOTE_TYPE_LABELS[note.noteType] ?? note.noteType}</Badge>
        <Badge>{PARA_TYPE_LABELS[note.paraType] ?? note.paraType}</Badge>
        {note.linkCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            {note.linkCount}
          </span>
        )}
        <span className="ml-auto">{formatRelative(note.updatedAt)}</span>
      </div>
    </Link>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
      {children}
    </span>
  );
}

function formatRelative(ms: number): string {
  if (!ms) return '';
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (min < 1) return 'hace instantes';
  if (min < 60) return rtf.format(-min, 'minute');
  if (hr < 24) return rtf.format(-hr, 'hour');
  if (day < 7) return rtf.format(-day, 'day');
  if (day < 30) return rtf.format(-Math.floor(day / 7), 'week');
  if (day < 365) return rtf.format(-Math.floor(day / 30), 'month');
  return rtf.format(-Math.floor(day / 365), 'year');
}
