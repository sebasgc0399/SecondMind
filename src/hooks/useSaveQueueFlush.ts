import { useEffect } from 'react';
import { allQueues } from '@/lib/saveQueue';

// Listeners globales sobre los 7 queues (saveContent + 6 de F29):
// - 'beforeunload': si hay entries pending al cerrar tab/ventana, dispara
//   preventDefault para mostrar el dialog nativo "Hay cambios sin guardar"
//   + intento best-effort de flushAll. El browser puede tener tiempo para un
//   round-trip antes del unload si el usuario cancela el dialog. No bloquea
//   cierre limpio cuando todos los queues están vacíos.
// - 'online': cuando vuelve la conexión, dispara flushAll inmediato sobre
//   todos los queues. Recovery instantánea sin esperar al próximo backoff tick.
export default function useSaveQueueFlush(): void {
  useEffect(() => {
    function totalPending(): number {
      return allQueues.reduce((acc, q) => acc + q.getSnapshot().size, 0);
    }
    function flushAll(): Promise<unknown> {
      return Promise.allSettled(allQueues.map((q) => q.flushAll()));
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (totalPending() === 0) return;
      event.preventDefault();
      event.returnValue = '';
      void flushAll();
    }
    function handleOnline() {
      if (totalPending() === 0) return;
      void flushAll();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('online', handleOnline);
    };
  }, []);
}
