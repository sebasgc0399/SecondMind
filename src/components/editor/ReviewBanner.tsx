import { useState } from 'react';
import { RotateCcw, CalendarClock, Check, History } from 'lucide-react';
import useResurfacing, { Rating } from '@/hooks/useResurfacing';

interface ReviewBannerProps {
  noteId: string;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'hoy';
  if (diffDays === 1) return 'mañana';
  if (diffDays < 7) return `en ${diffDays} días`;
  if (diffDays < 30) return `en ${Math.round(diffDays / 7)} semanas`;
  return `en ${Math.round(diffDays / 30)} meses`;
}

// Wrapper común: todos los estados viven en la columna de lectura (max-w-180),
// alineados con la fila de metadata y el contenido del editor. Antes el banner
// era full-bleed con border-b; ahora es contenido y discreto.
function BannerShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-180 px-4 pt-3">{children}</div>;
}

export default function ReviewBanner({ noteId }: ReviewBannerProps) {
  const { isDue, hasReviewState, nextReviewDate, reviewNote, activateReview } =
    useResurfacing(noteId);
  const [justReviewed, setJustReviewed] = useState(false);

  const handleReview = (rating: typeof Rating.Good | typeof Rating.Again) => {
    reviewNote(rating);
    setJustReviewed(true);
  };

  if (justReviewed) {
    return (
      <BannerShell>
        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/[0.07] px-3 py-2">
          <Check className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
          <span className="text-sm text-green-700 dark:text-green-400">
            Revisado. Próxima revisión:{' '}
            {nextReviewDate ? formatRelativeDate(nextReviewDate) : 'pronto'}
          </span>
        </div>
      </BannerShell>
    );
  }

  if (isDue) {
    return (
      <BannerShell>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] py-1 pl-3 pr-1">
          <div className="flex min-w-0 items-center gap-2">
            <History
              className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <span className="truncate text-sm text-amber-700 dark:text-amber-400">
              ¿La recordás?
            </span>
          </div>
          {/* Jerarquía Good=primary filled / Again=ghost: con dos botones-icono la
              distinguibilidad la da el peso visual (sin color son solo ↺ y ✓).
              DEUDA DE BETA: al abrir multi-user conviene igualar el peso de ambos
              botones (apoyándose en los íconos + el texto "¿La recordás?"). Un CTA
              prominente sesga la autoevaluación FSRS hacia "lo recuerdo" — y ese
              juicio honesto ES el input del algoritmo, no debería empujarse. */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => handleReview(Rating.Again)}
              aria-label="Necesito repasarla"
              title="Necesito repasarla"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground motion-safe:active:scale-95"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => handleReview(Rating.Good)}
              aria-label="La recuerdo bien"
              title="La recuerdo bien"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 motion-safe:active:scale-95"
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </BannerShell>
    );
  }

  if (hasReviewState && nextReviewDate) {
    return (
      <BannerShell>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Próxima revisión: {formatRelativeDate(nextReviewDate)}</span>
        </div>
      </BannerShell>
    );
  }

  return (
    <BannerShell>
      <button
        type="button"
        onClick={activateReview}
        className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground motion-safe:active:scale-95"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Activar revisión periódica
      </button>
    </BannerShell>
  );
}
