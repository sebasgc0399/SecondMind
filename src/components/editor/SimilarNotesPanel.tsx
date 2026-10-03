import { useMemo } from 'react';
import { Link } from 'react-router';
import { Link2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCell } from 'tinybase/ui-react';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import useSimilarNotes from '@/hooks/useSimilarNotes';
import useInsertSimilarLink from '@/hooks/useInsertSimilarLink';
import { parseIds } from '@/lib/tinybase';
import type { Editor } from '@tiptap/core';

interface SimilarNotesPanelProps {
  noteId: string;
  // Instancia del editor de la nota actual; null mientras no está lista.
  editor: Editor | null;
}

export default function SimilarNotesPanel({ noteId, editor }: SimilarNotesPanelProps) {
  const { t } = useTranslation();
  const { notes, isLoading, noEmbedding, disabled } = useSimilarNotes(noteId);
  const isOnline = useOnlineStatus();
  const insertLink = useInsertSimilarLink(editor);
  const outgoingLinkIdsRaw =
    (useCell('notes', noteId, 'outgoingLinkIds') as string | undefined) ?? '[]';
  const linkedIds = useMemo(() => new Set(parseIds(outgoingLinkIdsRaw)), [outgoingLinkIdsRaw]);

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
          {notes.map((note) => {
            const isLinked = linkedIds.has(note.noteId);
            const label = isLinked
              ? t('editor.similar.alreadyLinked', 'Ya enlazada')
              : t('editor.similar.insertLink', 'Insertar enlace');
            return (
              <li key={note.noteId} className="flex items-center gap-1">
                <Link
                  to={`/notes/${note.noteId}`}
                  className="flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                >
                  <span className="truncate text-foreground">{note.title}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {Math.round(note.score * 100)}%
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => insertLink(note.noteId, note.title)}
                  disabled={isLinked || !editor}
                  aria-label={label}
                  title={label}
                  className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Link2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
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
