import { Popover } from '@base-ui/react/popover';
import { CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { allQueues, createsQueueBindings } from '@/lib/saveQueue';
import usePendingSyncCount from '@/hooks/usePendingSyncCount';
import useExpandThenCollapse from '@/hooks/useExpandThenCollapse';
import { cn } from '@/lib/utils';

const COLLAPSE_DELAY_MS = 3000;

// Wrapper que aísla el lifecycle del componente con animación. Sin esto, el
// hook useExpandThenCollapse correría desde el primer render de la app
// (cuando hasAny=false el componente sigue renderizando — solo retorna null
// post-hook), y el timer de collapse expiraría ANTES de que aparezca el
// primer pending. Resultado: chip arranca colapsado.
//
// El wrapper monta/desmonta IndicatorBody según hasAny. Cada vez que un
// nuevo set de pending aparece, IndicatorBody se monta fresh con
// expanded=true y arranca el timer.
export default function PendingSyncIndicator() {
  const { hasAny } = usePendingSyncCount();
  if (!hasAny) return null;
  return <IndicatorBody />;
}

function IndicatorBody() {
  const { total, errorCount, byEntity } = usePendingSyncCount();
  const isError = errorCount > 0;
  // triggerKey re-expande SOLO en transición a/desde error (callout por
  // cambio de severity). Cambios numéricos sin cambio de severity (1→2
  // pendientes, o 1→2 errores) NO re-expanden — evita ruido visual.
  const expanded = useExpandThenCollapse(isError ? 'error' : 'normal', COLLAPSE_DELAY_MS);

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
          'relative inline-flex h-11 min-w-11 items-center justify-center overflow-hidden rounded-md outline-none',
          'transition-[max-width,padding,column-gap,background-color] duration-300 ease-out',
          expanded ? 'max-w-[180px] gap-1.5 px-2' : 'max-w-11 gap-0 px-0',
          isError
            ? 'bg-destructive/15 text-destructive hover:bg-destructive/20'
            : 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400',
        )}
      >
        <CloudOff className="h-3.5 w-3.5 shrink-0" />
        <span
          className={cn(
            'overflow-hidden whitespace-nowrap text-xs font-medium',
            'transition-[opacity,max-width] duration-300 ease-out',
            expanded ? 'max-w-[140px] opacity-100' : 'max-w-0 opacity-0',
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            'pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full',
            'transition-opacity duration-200',
            expanded ? 'opacity-0' : 'opacity-100',
            isError ? 'bg-destructive' : 'bg-amber-500',
          )}
          aria-hidden
        />
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
