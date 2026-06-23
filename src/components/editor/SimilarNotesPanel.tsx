import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import useSimilarNotes from '@/hooks/useSimilarNotes';

interface SimilarNotesPanelProps {
  noteId: string;
}

export default function SimilarNotesPanel({ noteId }: SimilarNotesPanelProps) {
  const { t } = useTranslation();
  const { notes, isLoading, noEmbedding, disabled } = useSimilarNotes(noteId);
  const isOnline = useOnlineStatus();

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        {t('editor.similar.title', 'Notas similares')}
        {notes.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">({notes.length})</span>
        )}
      </h2>

      {!isOnline && (
        <p className="text-xs text-muted-foreground">
          {t('editor.similar.offline', 'Disponible cuando vuelva la conexión.')}
        </p>
      )}

      {isOnline && isLoading && <SimilarNotesSkeleton />}

      {/* SPEC-66 F4 — sin consentimiento la semántica está inerte: guiar a
          activarla (banner de búsqueda / Ajustes), no decir "sin similares". */}
      {isOnline && !isLoading && disabled && (
        <p className="text-xs text-muted-foreground">
          {t(
            'editor.similar.disabled',
            'Activá la búsqueda semántica en Ajustes para ver notas similares.',
          )}
        </p>
      )}

      {isOnline && !isLoading && !disabled && noEmbedding && (
        <p className="text-xs text-muted-foreground">
          {t('editor.similar.noEmbedding', 'Guarda la nota para ver sugerencias.')}
        </p>
      )}

      {isOnline && !isLoading && !disabled && !noEmbedding && notes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t('editor.similar.empty', 'Sin notas similares aún.')}
        </p>
      )}

      {isOnline && !isLoading && notes.length > 0 && (
        <ul className="flex flex-col gap-1">
          {notes.map((note) => (
            <li key={note.noteId}>
              <Link
                to={`/notes/${note.noteId}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <span className="truncate text-foreground">{note.title}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {Math.round(note.score * 100)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SimilarNotesSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
