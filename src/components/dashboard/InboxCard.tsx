import { Link } from 'react-router';
import useInbox from '@/hooks/useInbox';
import { formatRelative } from '@/lib/formatDate';
import type { InboxItem } from '@/types/inbox';

const PREVIEW_LIMIT = 3;

export default function InboxCard() {
  const { items, isInitializing } = useInbox();
  const preview = items.slice(0, PREVIEW_LIMIT);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">📬 Inbox</h2>
        {items.length > 0 && (
          <Link
            to="/inbox"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Procesar →
          </Link>
        )}
      </header>

      {isInitializing && preview.length === 0 ? (
        <CardSkeleton rows={3} />
      ) : preview.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inbox limpio 🎉</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {preview.map((item) => (
            <li key={item.id}>
              <InboxPreviewItem item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InboxPreviewItem({ item }: { item: InboxItem }) {
  return (
    <Link
      to="/inbox"
      className="group block rounded-md border border-border/60 bg-background/40 p-3 transition-colors hover:border-border hover:bg-accent/30"
    >
      <p className="line-clamp-2 text-sm text-foreground">{item.rawContent}</p>
      <span className="mt-1 block text-[11px] text-muted-foreground">
        {formatRelative(item.createdAt)}
      </span>
    </Link>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-md border border-border/60 bg-background/40 p-3">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
