import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useFlushThenUpdate from '@/hooks/useFlushThenUpdate';
import useMountedTransition from '@/hooks/useMountedTransition';
import { cn } from '@/lib/utils';

const ANIMATION_DURATION_MS = 200;

const formatPending = (n: number) =>
  `${n} cambio${n !== 1 ? 's' : ''} pendiente${n !== 1 ? 's' : ''}`;
const formatUnsynced = (n: number) => `${n} cambio${n !== 1 ? 's' : ''} sin sincronizar`;

export default function UpdateBanner() {
  const {
    needRefresh,
    status,
    pendingTotal,
    pendingErrorCount,
    startFlushAndUpdate,
    forceUpdateIgnoringFailures,
    cancel,
  } = useFlushThenUpdate();
  const transition = useMountedTransition(needRefresh, ANIMATION_DURATION_MS);

  if (!transition.shouldRender) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-3 border-b border-primary/20 bg-primary px-4 py-2 text-primary-foreground',
        transition.justMounted && 'animate-in slide-in-from-top duration-200',
        transition.isExiting && 'animate-out slide-out-to-top duration-200 fill-mode-forwards',
      )}
    >
      {(status === 'flushing' || status === 'reloading') && (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <p className="flex-1 text-sm">
            {status === 'flushing' ? 'Sincronizando antes de actualizar…' : 'Actualizando…'}
          </p>
        </>
      )}

      {status === 'partial-failure' && (
        <>
          <RefreshCw className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-sm">{formatUnsynced(pendingErrorCount)}.</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => void startFlushAndUpdate()}>
              Reintentar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void forceUpdateIgnoringFailures()}>
              Actualizar igual
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              Cancelar
            </Button>
          </div>
        </>
      )}

      {status === 'idle' && (
        <>
          <RefreshCw className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-sm">
            Hay una nueva versión disponible
            {pendingTotal > 0 && ` (${formatPending(pendingTotal)})`}.
          </p>
          <Button size="sm" variant="secondary" onClick={() => void startFlushAndUpdate()}>
            Actualizar ahora
          </Button>
        </>
      )}
    </div>
  );
}
