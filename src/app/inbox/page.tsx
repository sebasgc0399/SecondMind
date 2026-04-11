import useInbox from '@/hooks/useInbox';
import InboxItemCard from '@/components/capture/InboxItem';

export default function InboxPage() {
  const { items, isInitializing, convertToNote, dismiss } = useInbox();

  const showSkeleton = isInitializing && items.length === 0;
  const showEmpty = !isInitializing && items.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        {items.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? 'pendiente' : 'pendientes'}
          </span>
        )}
      </header>

      {showSkeleton && <InboxSkeleton />}

      {showEmpty && <EmptyInboxState />}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <InboxItemCard
                item={item}
                onConvert={() => {
                  void convertToNote(item.id);
                }}
                onDismiss={() => dismiss(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyInboxState() {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="text-base font-medium text-foreground">Inbox limpio 🎉</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Capturá una idea nueva con{' '}
        <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
          Alt+N
        </kbd>{' '}
        desde cualquier pantalla.
      </p>
    </div>
  );
}
