import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import useFlushThenUpdate from '@/hooks/useFlushThenUpdate';
import useMountedTransition from '@/hooks/useMountedTransition';
import { isCapacitor } from '@/lib/capacitor';
import { isTauri } from '@/lib/tauri';
import { cn } from '@/lib/utils';

const ANIMATION_DURATION_MS = 200;

// Outer gate (sin hooks): el flujo de update SW es web-only. En native
// (Tauri/Capacitor) la app no registra SW — montar la cadena de hooks de
// WebUpdateBanner (useFlushThenUpdate → useSwUpdate → useRegisterSW) ES lo que
// registraría el SW. Cortar el mount acá es el fix del cache stale en Android.
// isTauri()/isCapacitor() son funciones puras: seguro llamarlas antes del
// early-return sin violar reglas de hooks (este componente no usa ninguno).
export default function UpdateBanner() {
  if (isTauri() || isCapacitor()) return null;
  return <WebUpdateBanner />;
}

function WebUpdateBanner() {
  const { t } = useTranslation();
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
            {status === 'flushing'
              ? t('updateBanner.flushing', 'Sincronizando antes de actualizar…')
              : t('updateBanner.updating', 'Actualizando…')}
          </p>
        </>
      )}

      {status === 'partial-failure' && (
        <>
          <RefreshCw className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-sm">
            {t('updateBanner.unsynced', { count: pendingErrorCount })}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => void startFlushAndUpdate()}>
              {t('common.retry', 'Reintentar')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void forceUpdateIgnoringFailures()}>
              {t('updateBanner.forceUpdate', 'Actualizar igual')}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              {t('common.cancel', 'Cancelar')}
            </Button>
          </div>
        </>
      )}

      {status === 'idle' && (
        <>
          <RefreshCw className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-sm">
            {pendingTotal > 0
              ? t('updateBanner.newVersionPending', { count: pendingTotal })
              : t('updateBanner.newVersion', 'Hay una nueva versión disponible.')}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void startFlushAndUpdate()}>
            {t('updateBanner.updateNow', 'Actualizar ahora')}
          </Button>
        </>
      )}
    </div>
  );
}
