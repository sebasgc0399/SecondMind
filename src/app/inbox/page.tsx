import { useCallback } from 'react';
import useInbox from '@/hooks/useInbox';
import InboxItemCard from '@/components/capture/InboxItem';
import type { ConvertOverrides, InboxAiResult } from '@/types/inbox';

export default function InboxPage() {
  const { items, isInitializing, convertToNote, convertToTask, convertToProject, dismiss } =
    useInbox();

  const showSkeleton = isInitializing && items.length === 0;
  const showEmpty = !isInitializing && items.length === 0;

  const handleAcceptSuggestion = useCallback(
    (itemId: string, edited: InboxAiResult) => {
      const overrides: ConvertOverrides = {
        title: edited.suggestedTitle,
        area: edited.suggestedArea,
        priority: edited.priority,
        tags: edited.suggestedTags,
      };
      switch (edited.suggestedType) {
        case 'note':
          void convertToNote(itemId, overrides);
          break;
        case 'task':
          void convertToTask(itemId, overrides);
          break;
        case 'project':
          void convertToProject(itemId, overrides);
          break;
        case 'trash':
        case 'reference':
        default:
          dismiss(itemId);
      }
    },
    [convertToNote, convertToTask, convertToProject, dismiss],
  );

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
                onAcceptSuggestion={(edited) => handleAcceptSuggestion(item.id, edited)}
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
