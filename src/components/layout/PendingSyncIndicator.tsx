import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { allQueues, createsQueueBindings, retryAllErrors } from '@/lib/saveQueue';
import usePendingSyncCount from '@/hooks/usePendingSyncCount';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import useExpandThenCollapse from '@/hooks/useExpandThenCollapse';
import { cn } from '@/lib/utils';
import DiscardPendingDialog from './DiscardPendingDialog';

const COLLAPSE_DELAY_MS = 3000;

type Severity = 'error' | 'offline' | 'pending';

interface PendingSyncIndicatorProps {
  // Cuando true, el chip se mantiene siempre en estado compact (44x44 con dot)
  // sin animación expand inicial ni re-expand en transición de severity.
  // El label se expone vía title HTML nativo para hover-reveal en sidebar
  // colapsado / tablet — mismo patrón que los nav items.
  compact?: boolean;
}

// Wrapper que aísla el lifecycle del componente con animación. Sin esto, el
// hook useExpandThenCollapse correría desde el primer render de la app y el
// timer de collapse expiraría ANTES de que aparezca el primer pending.
//
// F42.3: además de hasAny, también renderiza si el usuario está offline
// (anuncio persistente del estado de red). El IndicatorBody se monta fresh
// cada vez que cambia "hay algo que mostrar", reactivando la expand-anim.
export default function PendingSyncIndicator({ compact = false }: PendingSyncIndicatorProps = {}) {
  const { hasAny } = usePendingSyncCount();
  const isOnline = useOnlineStatus();
  if (isOnline && !hasAny) return null;
  return <IndicatorBody compact={compact} />;
}

function IndicatorBody({ compact }: { compact: boolean }) {
  const { total, errorCount, byEntity } = usePendingSyncCount();
  const isOnline = useOnlineStatus();
  const isError = errorCount > 0;
  const [discardOpen, setDiscardOpen] = useState(false);

  // Severity con prioridad: error > offline > pending. triggerKey re-expande
  // SOLO en transición de severity (no en cambios numéricos del mismo bucket).
  const severity: Severity = isError ? 'error' : !isOnline ? 'offline' : 'pending';
  const rawExpanded = useExpandThenCollapse(severity, COLLAPSE_DELAY_MS);
  // En modo compact el chip queda siempre 44x44 con dot. La info detallada se
  // accede via tooltip on-hover (title) y popover on-click — sin overflow del
  // expand de 180px que rompería el sidebar w-16.
  const expanded = compact ? false : rawExpanded;

  const label = (() => {
    if (isError) return `${errorCount} sin guardar`;
    if (!isOnline && total > 0) {
      return `Sin conexión · ${total} pendiente${total !== 1 ? 's' : ''}`;
    }
    if (!isOnline) return 'Sin conexión';
    return `${total} pendiente${total !== 1 ? 's' : ''}`;
  })();

  const chipColors = (() => {
    switch (severity) {
      case 'error':
        return 'bg-destructive/15 text-destructive hover:bg-destructive/20';
      case 'offline':
        return 'bg-blue-500/15 text-blue-700 hover:bg-blue-500/20 dark:text-blue-400';
      case 'pending':
        return 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400';
    }
  })();

  const dotColor = (() => {
    switch (severity) {
      case 'error':
        return 'bg-destructive';
      case 'offline':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-amber-500';
    }
  })();

  function handleRetryAll() {
    retryAllErrors();
  }

  function handleDiscardClick() {
    setDiscardOpen(true);
  }

  function handleDiscardConfirm() {
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

  // Reintentar tiene sentido solo si hay errors Y red disponible. Offline el
  // network call falla igual; para pending sin error el queue ya retientea
  // automático con backoff.
  const retryDisabled = errorCount === 0 || !isOnline;

  return (
    <>
      <Popover.Root>
        <Popover.Trigger
          aria-label={`${label}: abrir detalle`}
          title={compact ? label : undefined}
          className={cn(
            'relative inline-flex h-11 min-w-11 items-center justify-center overflow-hidden rounded-md outline-none',
            'transition-[max-width,padding,column-gap,background-color] duration-300 ease-out',
            expanded ? 'max-w-[220px] gap-1.5 px-2' : 'max-w-11 gap-0 px-0',
            chipColors,
          )}
        >
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
          <span
            className={cn(
              'overflow-hidden whitespace-nowrap text-xs font-medium',
              'transition-[opacity,max-width] duration-300 ease-out',
              expanded ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0',
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              'pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full',
              'transition-opacity duration-200',
              expanded ? 'opacity-0' : 'opacity-100',
              dotColor,
            )}
            aria-hidden
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={8} align="end">
            <Popover.Popup className="z-50 w-64 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl outline-none transition-[opacity,transform,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <Popover.Title className="text-xs font-semibold text-foreground">
                {!isOnline ? 'Sin conexión' : 'Cambios pendientes de sincronizar'}
              </Popover.Title>
              {!isOnline && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Los cambios se sincronizarán al reconectar.
                </p>
              )}
              {byEntity.length > 0 ? (
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
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Sin cambios pendientes.</p>
              )}
              {byEntity.length > 0 && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleRetryAll}
                    disabled={retryDisabled}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RefreshCw className="h-3 w-3" /> Reintentar
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscardClick}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <Trash2 className="h-3 w-3" /> Descartar
                  </button>
                </div>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <DiscardPendingDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={handleDiscardConfirm}
      />
    </>
  );
}
