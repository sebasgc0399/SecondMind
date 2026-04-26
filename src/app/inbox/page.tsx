import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Play, Sparkles } from 'lucide-react';
import useInbox, { HIGH_CONFIDENCE_THRESHOLD } from '@/hooks/useInbox';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import InboxItemCard from '@/components/capture/InboxItem';
import type { ConvertOverrides, InboxAiResult, InboxItem } from '@/types/inbox';

type BatchStatus =
  | { kind: 'idle' }
  | { kind: 'processing' }
  | { kind: 'done'; ok: number; failed: number };

export default function InboxPage() {
  const {
    items,
    isInitializing,
    convertToNote,
    convertToTask,
    convertToProject,
    dismiss,
    acceptHighConfidence,
  } = useInbox();
  const isOnline = useOnlineStatus();

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
        default:
          dismiss(itemId);
      }
    },
    [convertToNote, convertToTask, convertToProject, dismiss],
  );

  const { high, review } = useMemo(() => {
    const h: InboxItem[] = [];
    const r: InboxItem[] = [];
    for (const it of items) {
      if (
        typeof it.aiResult?.confidence === 'number' &&
        it.aiResult.confidence >= HIGH_CONFIDENCE_THRESHOLD
      ) {
        h.push(it);
      } else {
        r.push(it);
      }
    }
    return { high: h, review: r };
  }, [items]);

  const [batchStatus, setBatchStatus] = useState<BatchStatus>({ kind: 'idle' });

  const handleAcceptAll = useCallback(async () => {
    setBatchStatus({ kind: 'processing' });
    const result = await acceptHighConfidence();
    setBatchStatus({ kind: 'done', ...result });
    setTimeout(() => setBatchStatus({ kind: 'idle' }), 3000);
  }, [acceptHighConfidence]);

  const batchLabel =
    batchStatus.kind === 'processing'
      ? 'Procesando...'
      : batchStatus.kind === 'done'
        ? `✓ ${batchStatus.ok} aceptados${
            batchStatus.failed ? ` · ⚠ ${batchStatus.failed} fallaron` : ''
          }`
        : `Aceptar ${high.length} ${high.length === 1 ? 'item' : 'items'}`;

  const batchDisabled = batchStatus.kind === 'processing' || high.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="hidden items-end gap-3 md:flex">
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          {items.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          )}
        </div>
        {items.length > 0 && isOnline ? (
          <Link
            to="/inbox/process"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Play className="h-3.5 w-3.5" />
            Procesar
          </Link>
        ) : (
          <span
            aria-disabled="true"
            title={items.length > 0 && !isOnline ? 'Requiere conexión a internet' : undefined}
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-primary/30 px-3 py-1.5 text-sm font-medium text-primary-foreground/60"
          >
            <Play className="h-3.5 w-3.5" />
            Procesar
          </span>
        )}
      </header>

      {showSkeleton && <InboxSkeleton />}

      {showEmpty && <EmptyInboxState />}

      {items.length > 0 && (
        <div className="flex flex-col gap-6">
          {high.length > 0 && (
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Alta confianza <span className="text-muted-foreground">· {high.length}</span>
                </h2>
                <button
                  type="button"
                  onClick={() => void handleAcceptAll()}
                  disabled={batchDisabled}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {batchLabel}
                </button>
              </div>
              <ul className="flex flex-col gap-3">
                {high.map((item) => (
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
            </section>
          )}

          {review.length > 0 && (
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Revisar <span className="text-muted-foreground">· {review.length}</span>
                </h2>
              </div>
              <ul className="flex flex-col gap-3">
                {review.map((item) => (
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
            </section>
          )}
        </div>
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
