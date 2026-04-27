import { useEffect } from 'react';
import { saveContentQueue } from '@/lib/saveQueue';

// Listeners globales del saveContentQueue:
// - 'beforeunload': si hay entries pending al cerrar tab/ventana, dispara
//   preventDefault para mostrar el dialog nativo "Hay cambios sin guardar"
//   + intento best-effort de flushAll. El browser puede tener tiempo para un
//   round-trip antes del unload si el usuario cancela el dialog. No bloquea
//   cierre limpio cuando el queue está vacío.
// - 'online': cuando vuelve la conexión, dispara flushAll inmediato. Recovery
//   instantánea sin esperar al próximo backoff tick (1/2/4s).
export default function useSaveQueueFlush(): void {
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      const snapshot = saveContentQueue.getSnapshot();
      if (snapshot.size === 0) return;
      event.preventDefault();
      event.returnValue = '';
      void saveContentQueue.flushAll();
    }
    function handleOnline() {
      const snapshot = saveContentQueue.getSnapshot();
      if (snapshot.size === 0) return;
      void saveContentQueue.flushAll();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('online', handleOnline);
    };
  }, []);
}
