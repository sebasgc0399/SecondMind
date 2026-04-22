import { Link } from 'react-router';
import { CalendarClock, Network } from 'lucide-react';
import useDailyDigest from '@/hooks/useDailyDigest';
import type { DigestItem } from '@/hooks/useDailyDigest';

export default function DailyDigest() {
  const { items, isInitializing } = useDailyDigest();

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Daily Digest</h2>
      </header>

      {isInitializing && items.length === 0 ? (
        <CardSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Crea y revisa notas para activar tu Daily Digest.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.noteId}>
              <DigestItemRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DigestItemRow({ item }: { item: DigestItem }) {
  const Icon = item.reason === 'review' ? CalendarClock : Network;

  return (
    <Link
      to={`/notes/${item.noteId}`}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {item.title}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{item.detail}</span>
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
