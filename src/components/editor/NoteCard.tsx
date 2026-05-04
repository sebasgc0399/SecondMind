import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { Link2, Sparkles, Star, Trash2, Undo2 } from 'lucide-react';
import type { NoteOramaDoc } from '@/lib/orama';
import { formatRelative } from '@/lib/formatDate';
import { notesRepo } from '@/infra/repos/notesRepo';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import PendingSyncDot from '@/components/layout/PendingSyncDot';

interface NoteCardProps {
  note: NoteOramaDoc;
  semanticScore?: number;
  mode?: 'normal' | 'trash';
  // Solo se renderiza en mode === 'trash'. null = "Nunca" (auto-purga
  // desactivada). 0 = "Pendiente" (cron diario aún no corrió pero el plazo
  // ya se cumplió).
  daysUntilPurge?: number | null;
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

// Hover-reveal: en viewports md+ (≥768px) se esconde y aparece en hover/focus;
// en mobile queda visible siempre para que el tap sea descubrible. Usamos
// breakpoint en lugar de @media(hover:hover) porque hover: hover se evalúa
// según el input device, no el viewport — en navegadores headless con
// mouse-driven simulation a 375px hover: hover sigue siendo true.
const HOVER_REVEAL =
  'md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 motion-safe:transition-opacity';

function purgeBadgeLabel(daysUntilPurge: number | null | undefined): string | null {
  if (daysUntilPurge === undefined || daysUntilPurge === null) return null;
  if (daysUntilPurge === 0) return 'Pendiente';
  if (daysUntilPurge === 1) return '1 día';
  return `${daysUntilPurge} días`;
}

export default function NoteCard({
  note,
  semanticScore,
  mode = 'normal',
  daysUntilPurge,
}: NoteCardProps) {
  const snippet = note.contentPlain.trim().slice(0, 200);
  const showSnippet = snippet.length > 0;
  const [isSoftDeleteOpen, setIsSoftDeleteOpen] = useState(false);
  const [isHardDeleteOpen, setIsHardDeleteOpen] = useState(false);
  const isTrashMode = mode === 'trash';
  const purgeBadge = isTrashMode ? purgeBadgeLabel(daysUntilPurge) : null;

  function stop(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleToggleFavorite(event: MouseEvent) {
    stop(event);
    void notesRepo.toggleFavorite(note.id);
  }

  function handleOpenSoftDelete(event: MouseEvent) {
    stop(event);
    setIsSoftDeleteOpen(true);
  }

  function handleConfirmSoftDelete() {
    void notesRepo.softDelete(note.id);
  }

  function handleRestore(event: MouseEvent) {
    stop(event);
    void notesRepo.restore(note.id);
  }

  function handleOpenHardDelete(event: MouseEvent) {
    stop(event);
    setIsHardDeleteOpen(true);
  }

  function handleConfirmHardDelete() {
    void notesRepo.hardDelete(note.id);
  }

  return (
    <>
      <Link
        to={`/notes/${note.id}`}
        className="group relative block rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-accent/40"
      >
        <PendingSyncDot entityType="note" id={note.id} />
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
            {note.title}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {semanticScore !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
                <Sparkles className="h-3 w-3" />
                {Math.round(semanticScore * 100)}%
              </span>
            )}
            {isTrashMode ? (
              <>
                <button
                  type="button"
                  onClick={handleRestore}
                  aria-label="Restaurar nota"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleOpenHardDelete}
                  aria-label="Eliminar para siempre"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  aria-label={note.isFavorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
                  aria-pressed={note.isFavorite}
                  className={
                    note.isFavorite
                      ? 'inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-400 transition-colors hover:bg-amber-500/10'
                      : `inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${HOVER_REVEAL}`
                  }
                >
                  <Star
                    className="h-4 w-4"
                    fill={note.isFavorite ? 'currentColor' : 'none'}
                    strokeWidth={note.isFavorite ? 1.5 : 2}
                  />
                </button>
                <button
                  type="button"
                  onClick={handleOpenSoftDelete}
                  aria-label="Eliminar nota"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive ${HOVER_REVEAL}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
        {showSnippet && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{snippet}</p>
        )}
        {note.aiSummary && mode !== 'trash' && (
          <p
            className="mt-1 flex items-start gap-1.5 text-xs italic text-muted-foreground/80"
            aria-label="Resumen generado por IA"
          >
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" aria-hidden />
            <span className="line-clamp-2">{note.aiSummary}</span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {note.distillLevel > 0 && (
            <Badge className={DISTILL_BADGE_STYLES[note.distillLevel as 1 | 2 | 3]}>
              L{note.distillLevel}
            </Badge>
          )}
          <Badge>{NOTE_TYPE_LABELS[note.noteType] ?? note.noteType}</Badge>
          <Badge>{PARA_TYPE_LABELS[note.paraType] ?? note.paraType}</Badge>
          {purgeBadge && <Badge className="bg-destructive/10 text-destructive">{purgeBadge}</Badge>}
          {note.linkCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3 w-3" />
              {note.linkCount}
            </span>
          )}
          <span className="ml-auto">{formatRelative(note.updatedAt)}</span>
        </div>
      </Link>
      {!isTrashMode && (
        <ConfirmDialog
          open={isSoftDeleteOpen}
          onOpenChange={setIsSoftDeleteOpen}
          title="¿Mover esta nota a la papelera?"
          description="Puedes restaurarla desde Notas → Papelera o eliminarla definitivamente desde ahí."
          confirmLabel="Mover a papelera"
          variant="destructive"
          onConfirm={handleConfirmSoftDelete}
        />
      )}
      {isTrashMode && (
        <ConfirmDialog
          open={isHardDeleteOpen}
          onOpenChange={setIsHardDeleteOpen}
          title="¿Eliminar esta nota para siempre?"
          description="Esta acción no se puede deshacer. La nota, sus embeddings y los links que la mencionan se eliminan para siempre."
          confirmLabel="Eliminar para siempre"
          variant="destructive"
          onConfirm={handleConfirmHardDelete}
        />
      )}
    </>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  const base =
    'rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide';
  return <span className={className ? `${base} ${className}` : base}>{children}</span>;
}
