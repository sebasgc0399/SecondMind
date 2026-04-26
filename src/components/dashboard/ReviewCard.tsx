import { Link } from 'react-router';
import { Brain } from 'lucide-react';
import useReviewQueue from '@/hooks/useReviewQueue';
import type { ReviewItem } from '@/hooks/useReviewQueue';
import { formatRelative } from '@/lib/formatDate';

const MAX_VISIBLE = 5;

export default function ReviewCard() {
  const { items, total, isLoading } = useReviewQueue();
  const visible = items.slice(0, MAX_VISIBLE);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center gap-2">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">{headerCopy(total)}</h2>
      </header>

      {isLoading && total === 0 ? (
        <CardSkeleton />
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nada que repasar hoy. Vuelve mañana o crea más notas para activar la revisión.
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
              Ver todas las {total}
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function headerCopy(total: number): string {
  if (total === 0) return 'Por revisar';
  if (total === 1) return 'Te toca 1 nota hoy.';
  return `Te tocan ${total} notas hoy.`;
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
