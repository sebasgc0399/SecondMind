import { Popover } from '@base-ui/react/popover';
import { CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { allQueues, createsQueueBindings } from '@/lib/saveQueue';
import usePendingSyncCount from '@/hooks/usePendingSyncCount';
import { cn } from '@/lib/utils';

export default function PendingSyncIndicator() {
  const { total, errorCount, byEntity, hasAny } = usePendingSyncCount();
  if (!hasAny) return null;

  const isError = errorCount > 0;
  const label = isError
    ? `${errorCount} sin guardar`
    : `${total} pendiente${total !== 1 ? 's' : ''}`;

  function handleRetryAll() {
    allQueues.forEach((q) => {
      for (const [id, entry] of q.getSnapshot()) {
        if (entry.status === 'error') q.retryNow(id);
      }
    });
  }

  function handleDiscardAll() {
    // F30 G4: para entries de createsQueues, hacer delRow ANTES de clear()
    // porque el persister no auto-limpia rows huérfanas — el doc nunca llegó
    // a Firestore, onSnapshot no emite delete, didChange no se llama, y la
    // row local quedaría hasta refresh manual. Ver tinybase.ts:65-72.
    // Para meta + content queues NO aplica: el doc existe en server, el
    // persister auto-converge desde onSnapshot al reconectar.
    for (const { queue, store, table } of createsQueueBindings) {
      for (const [id] of queue.getSnapshot()) store.delRow(table, id);
    }
    // clear() cancela timers + vacía entries; mantiene subscribers.
    allQueues.forEach((q) => q.clear());
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`${label}: abrir detalle`}
        className={cn(
          'inline-flex h-11 min-w-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-colors',
          isError
            ? 'bg-destructive/15 text-destructive hover:bg-destructive/20'
            : 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400',
        )}
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span>{label}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end">
          <Popover.Popup className="z-50 w-64 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl outline-none transition-[opacity,transform,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="text-xs font-semibold text-foreground">
              Cambios pendientes de sincronizar
            </Popover.Title>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {byEntity.map((e) => (
                <li key={e.entity} className="flex items-center justify-between">
                  <span>
                    {e.count} {e.entity}
                  </span>
                  {e.hasError && (
                    <span className="text-[10px] font-semibold uppercase text-destructive">
                      error
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleRetryAll}
                disabled={errorCount === 0}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className="h-3 w-3" /> Reintentar
              </button>
              <button
                type="button"
                onClick={handleDiscardAll}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Trash2 className="h-3 w-3" /> Descartar
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
