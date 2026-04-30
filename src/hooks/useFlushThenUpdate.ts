import { useEffect, useRef, useState } from 'react';
import { allQueues, retryAllErrors } from '@/lib/saveQueue';
import usePendingSyncCount from '@/hooks/usePendingSyncCount';
import useSwUpdate from '@/hooks/useSwUpdate';

type FlushUpdateStatus = 'idle' | 'flushing' | 'partial-failure' | 'reloading';

interface UseFlushThenUpdateResult {
  needRefresh: boolean;
  status: FlushUpdateStatus;
  pendingTotal: number;
  pendingErrorCount: number;
  startFlushAndUpdate: () => Promise<void>;
  forceUpdateIgnoringFailures: () => Promise<void>;
  cancel: () => void;
}

// Compone useSwUpdate (needRefresh + applyUpdate con fallback 5s reload) +
// usePendingSyncCount (live count) + flushAll paralelo sobre los 11 queues.
//
// State machine:
//   idle  ──click──▶  flushing  ──ok──▶  reloading  ──reload──▶  (gone)
//                       │
//                       └──fail──▶  partial-failure  ──[Reintentar | Actualizar igual | Cancelar]
//
// Por qué useSwUpdate.applyUpdate (no updateServiceWorker raw): F3 D-F3.5
// agregó un fallback 5s reload por si la activación del SW falla silenciosamente.
// Reusarlo evita duplicar lógica defensiva.
export default function useFlushThenUpdate(): UseFlushThenUpdateResult {
  const { needRefresh, applyUpdate } = useSwUpdate();
  const pending = usePendingSyncCount();
  const [status, setStatus] = useState<FlushUpdateStatus>('idle');

  // Ref síncrono para race "click 2× en mismo frame": setStatus es async,
  // dos clicks en el mismo tick leerían `status === 'idle'` y disparán
  // ambos. inFlightRef muta inmediato y bloquea second invocation.
  const inFlightRef = useRef(false);

  // Auto-recovery: si en partial-failure los queues self-curan (online event
  // dispara retries internos del saveQueue), errorCount cae a 0. Auto-transition
  // a reloading sin requerir re-click del user. Si el user prefiere no
  // actualizar y ya no hay errores, igual está bien recargar — son writes
  // sincronizados, no cambios pendientes.
  useEffect(() => {
    if (status === 'partial-failure' && pending.errorCount === 0) {
      setStatus('reloading');
      void applyUpdate();
    }
  }, [status, pending.errorCount, applyUpdate]);

  const startFlushAndUpdate = async () => {
    if (inFlightRef.current) return;
    if (status !== 'idle' && status !== 'partial-failure') return;
    inFlightRef.current = true;
    setStatus('flushing');
    try {
      // Si venimos de partial-failure, hay entries en error que flushAll
      // marcaría 'failed' inmediato sin retry real. retryAllErrors fuerza
      // el retry; flushAll los espera.
      retryAllErrors();
      const results = await Promise.all(allQueues.map((q) => q.flushAll()));
      const failures = results.flatMap((r) => [...r.values()]).filter((v) => v === 'failed').length;
      if (failures === 0) {
        setStatus('reloading');
        await applyUpdate();
        return;
      }
      setStatus('partial-failure');
    } finally {
      inFlightRef.current = false;
    }
  };

  const forceUpdateIgnoringFailures = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus('reloading');
    try {
      await applyUpdate();
    } finally {
      inFlightRef.current = false;
    }
  };

  const cancel = () => {
    // No permitir cancel mid-reload: skipWaiting ya activó, no se puede
    // revertir. UI tampoco muestra Cancelar en ese estado.
    if (status === 'reloading') return;
    setStatus('idle');
  };

  return {
    needRefresh,
    status,
    pendingTotal: pending.total,
    pendingErrorCount: pending.errorCount,
    startFlushAndUpdate,
    forceUpdateIgnoringFailures,
    cancel,
  };
}
