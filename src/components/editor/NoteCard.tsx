import { Link } from 'react-router';
import { Link2 } from 'lucide-react';
import type { NoteOramaDoc } from '@/lib/orama';
import { formatRelative } from '@/lib/formatDate';

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
