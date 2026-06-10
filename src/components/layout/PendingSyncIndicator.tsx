import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CloudUpload, RefreshCw, Trash2 } from 'lucide-react';
import { allQueues, createsQueueBindings, retryAllErrors } from '@/lib/saveQueue';
import usePendingSyncCount from '@/hooks/usePendingSyncCount';
import useExpandThenCollapse from '@/hooks/useExpandThenCollapse';
import { cn } from '@/lib/utils';
import DiscardPendingDialog from './DiscardPendingDialog';

const COLLAPSE_DELAY_MS = 3000;

type Severity = 'error' | 'pending';

type PopoverSide = 'top' | 'right' | 'bottom' | 'left';

interface PendingSyncIndicatorProps {
  // Cuando true, el chip se mantiene siempre en estado compact (44x44 con dot)
  // sin animación expand inicial ni re-expand en transición de severity.
  // El label se expone vía title HTML nativo para hover-reveal en sidebar
  // colapsado / tablet — mismo patrón que los nav items.
  compact?: boolean;
  // Lado de apertura del popover. Default 'bottom' (montajes en barra superior:
  // MobileHeader, TopBar). El Sidebar pasa 'right' porque su trigger vive al
  // fondo-izquierda; con 'bottom'/'top' el popover abriría ENCIMA del nav.
  side?: PopoverSide;
}

// Wrapper que aísla el lifecycle del componente con animación. Sin esto, el
// hook useExpandThenCollapse correría desde el primer render de la app y el
// timer de collapse expiraría ANTES de que aparezca el primer pending.
//
// Renderiza solo cuando hay algo que sincronizar (pending o error). El
// IndicatorBody se monta fresh cada vez que "hay algo que mostrar" pasa de
// false→true, reactivando la expand-anim.
//
// Ya NO anuncia "offline" como estado propio: el sistema es network-agnóstico
// (gate por timeout del saveQueue, SPEC-57) y navigator.onLine no es confiable
// cross-platform (miente en el WebView de Android), así que distinguir offline
// de pending divergía el color por plataforma (azul desktop vs ámbar móvil).
// Offline sin writes pendientes ya no muestra chip; offline CON writes los
// encola y aparecen como "pendientes" (ámbar) igual en todas las plataformas.
export default function PendingSyncIndicator({
  compact = false,
  side = 'bottom',
}: PendingSyncIndicatorProps = {}) {
  const { hasAny } = usePendingSyncCount();
  if (!hasAny) return null;
  return <IndicatorBody compact={compact} side={side} />;
}

function IndicatorBody({ compact, side }: { compact: boolean; side: PopoverSide }) {
  const { total, errorCount, byEntity } = usePendingSyncCount();
  const isError = errorCount > 0;
  const [discardOpen, setDiscardOpen] = useState(false);

  // Severity con prioridad: error > pending. triggerKey re-expande SOLO en
  // transición de severity (no en cambios numéricos del mismo bucket).
  const severity: Severity = isError ? 'error' : 'pending';
  const rawExpanded = useExpandThenCollapse(severity, COLLAPSE_DELAY_MS);
  // En modo compact el chip queda siempre 44x44 con dot. La info detallada se
  // accede via tooltip on-hover (title) y popover on-click — sin overflow del
  // expand de 180px que rompería el sidebar w-16.
  const expanded = compact ? false : rawExpanded;

  const label = isError
    ? `${errorCount} sin guardar`
    : `${total} pendiente${total !== 1 ? 's' : ''}`;

  const chipColors = (() => {
    switch (severity) {
      case 'error':
        return 'bg-destructive/15 text-destructive hover:bg-destructive/20';
      case 'pending':
        return 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400';
    }
  })();

  const dotColor = (() => {
    switch (severity) {
      case 'error':
        return 'bg-destructive';
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

  // Reintentar tiene sentido solo si hay errors; para pending sin error el queue
  // ya retientea automático con backoff. Sin detección de red: si no hay
  // conexión, el retry simplemente vuelve a fallar y re-encola.
  const retryDisabled = errorCount === 0;

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
          <CloudUpload className="h-3.5 w-3.5 shrink-0" />
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
          {/* z-50 vive en el Positioner (positioned), NO en el Popup: el Popup
              es position:static y ahí z-index no aplica. El Sidebar floating es
              z-30, así que sin esto el popover queda DETRÁS del sidebar. */}
          <Popover.Positioner side={side} sideOffset={8} align="end" className="z-50">
            <Popover.Popup className="w-64 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl outline-none transition-[opacity,transform,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <Popover.Title className="text-xs font-semibold text-foreground">
                Cambios pendientes de sincronizar
              </Popover.Title>
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
