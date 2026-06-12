import { Link } from 'react-router';
import { Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useReviewQueue from '@/hooks/useReviewQueue';
import type { ReviewItem } from '@/hooks/useReviewQueue';
import { formatRelative } from '@/lib/formatDate';

const MAX_VISIBLE = 5;

export default function ReviewCard() {
  const { t } = useTranslation();
  const { items, total, isLoading } = useReviewQueue();
  const visible = items.slice(0, MAX_VISIBLE);

  // Plural real (toca/tocan) → formas _one/_many/_other del catálogo.
  const headerCopy =
    total === 0
      ? t('dashboard.review.titleEmpty', 'Por revisar')
      : t('dashboard.review.title', { count: total });

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center gap-2">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">{headerCopy}</h2>
      </header>

      {isLoading && total === 0 ? (
        <CardSkeleton />
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(
            'dashboard.review.empty',
            'Nada que repasar hoy. Vuelve mañana o crea más notas para activar la revisión.',
          )}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {visible.map((item) => (
              <li key={item.id}>
                <ReviewRow item={item} />
              </li>
            ))}
          </ul>
          {total > MAX_VISIBLE && (
            <Link
              to="/notes?filter=review"
              className="mt-3 block text-xs font-medium text-primary hover:underline"
            >
              {t('dashboard.review.seeAll', 'Ver todas las {{total}}', { total })}
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function ReviewRow({ item }: { item: ReviewItem }) {
  return (
    <Link
      to={`/notes/${item.id}`}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {item.title}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {formatRelative(item.fsrsDue)}
      </span>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-1.5">
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
