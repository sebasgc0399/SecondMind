import { Link } from 'react-router';
import { Link2, Sparkles } from 'lucide-react';
import type { NoteOramaDoc } from '@/lib/orama';
import { formatRelative } from '@/lib/formatDate';

interface NoteCardProps {
  note: NoteOramaDoc;
  semanticScore?: number;
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

const DISTILL_BADGE_STYLES: Record<1 | 2 | 3, string> = {
  1: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  2: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  3: 'bg-green-500/15 text-green-700 dark:text-green-400',
};

export default function NoteCard({ note, semanticScore }: NoteCardProps) {
  const snippet = note.contentPlain.trim().slice(0, 200);
  const showSnippet = snippet.length > 0;

  return (
    <Link
      to={`/notes/${note.id}`}
      className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
          {note.title}
        </h2>
        {semanticScore !== undefined && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-xs font-medium text-violet-500">
            <Sparkles className="h-3 w-3" />
            {Math.round(semanticScore * 100)}%
          </span>
        )}
      </div>
      {showSnippet && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{snippet}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {note.distillLevel > 0 && (
          <Badge className={DISTILL_BADGE_STYLES[note.distillLevel as 1 | 2 | 3]}>
            L{note.distillLevel}
          </Badge>
        )}
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

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  const base =
    'rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide';
  return <span className={className ? `${base} ${className}` : base}>{children}</span>;
}
