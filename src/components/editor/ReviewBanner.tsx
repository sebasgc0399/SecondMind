import { useState } from 'react';
import { RotateCcw, CalendarClock, Check } from 'lucide-react';
import useResurfacing, { Rating } from '@/hooks/useResurfacing';

interface ReviewBannerProps {
  noteId: string;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'hoy';
  if (diffDays === 1) return 'manana';
  if (diffDays < 7) return `en ${diffDays} dias`;
  if (diffDays < 30) return `en ${Math.round(diffDays / 7)} semanas`;
  return `en ${Math.round(diffDays / 30)} meses`;
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
      <div className="flex items-center gap-2 border-b border-border bg-green-500/10 px-4 py-2">
        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-sm text-green-700 dark:text-green-400">
          Revisado. Proxima revision:{' '}
          {nextReviewDate ? formatRelativeDate(nextReviewDate) : 'pronto'}
        </span>
      </div>
    );
  }

  if (isDue) {
    return (
      <div className="flex items-center gap-3 border-b border-border bg-amber-500/10 px-4 py-2">
        <RotateCcw className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm text-amber-700 dark:text-amber-400">
          Esta nota necesita revision
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => handleReview(Rating.Again)}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Necesito repasarla
          </button>
          <button
            type="button"
            onClick={() => handleReview(Rating.Good)}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            La recuerdo bien
          </button>
        </div>
      </div>
    );
  }

  if (hasReviewState && nextReviewDate) {
    return (
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Proxima revision: {formatRelativeDate(nextReviewDate)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
      <button
        type="button"
        onClick={activateReview}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Activar revision periodica
      </button>
    </div>
  );
}
