import { Link } from 'react-router';
import { X } from 'lucide-react';
import { formatRelative } from '@/lib/formatDate';

export interface LinkedNote {
  id: string;
  title: string;
  paraType: string;
  noteType: string;
  updatedAt: number;
}

interface ProjectNoteListProps {
  notes: LinkedNote[];
  onUnlink: (noteId: string) => void;
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

export default function ProjectNoteList({ notes, onUnlink }: ProjectNoteListProps) {
  if (notes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Sin notas vinculadas aún</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Vinculá notas existentes desde el botón de arriba.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {notes.map((note) => (
        <li key={note.id}>
          <div className="group flex items-center gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-border/80 hover:bg-accent/40">
            <Link to={`/notes/${note.id}`} className="flex-1 min-w-0">
              <h4 className="truncate text-sm font-medium text-foreground">
                {note.title || 'Sin título'}
              </h4>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium uppercase tracking-wide">
                  {NOTE_TYPE_LABELS[note.noteType] ?? note.noteType}
                </span>
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium uppercase tracking-wide">
                  {PARA_TYPE_LABELS[note.paraType] ?? note.paraType}
                </span>
                <span>{formatRelative(note.updatedAt)}</span>
              </div>
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUnlink(note.id);
              }}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-destructive"
              aria-label="Desvincular nota"
              title="Desvincular"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
