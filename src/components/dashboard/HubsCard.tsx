import { Link } from 'react-router';
import { Network } from 'lucide-react';
import useKnowledgeHubs from '@/hooks/useKnowledgeHubs';
import type { HubItem } from '@/hooks/useKnowledgeHubs';

export default function HubsCard() {
  const { items, isInitializing } = useKnowledgeHubs();

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Hubs activos</h2>
      </header>

      {isInitializing && items.length === 0 ? (
        <CardSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Linkea notas escribiendo @ — los hubs aparecerán acá.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.noteId}>
              <HubRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HubRow({ item }: { item: HubItem }) {
  return (
    <Link
      to={`/notes/${item.noteId}`}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
    >
      <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {item.title}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        Hub: {item.linkCount} conexiones
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
