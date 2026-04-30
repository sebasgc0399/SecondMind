import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isCapacitor } from '@/lib/capacitor';
import { isTauri } from '@/lib/tauri';

const POLL_INTERVAL_MS = 60 * 60 * 1000;
const RELOAD_FALLBACK_MS = 5000;

interface UseSwUpdateResult {
  needRefresh: boolean;
  applyUpdate: () => Promise<void>;
  updateServiceWorker: (reload?: boolean) => Promise<void>;
}

// Wrapper liviano sobre useRegisterSW de virtual:pwa-register/react.
//
// Native shells (Tauri/Capacitor) tienen sus propios updaters
// (useAutoUpdate / Play Store), por eso skip register + polling.
//
// Polling vive en useEffect con cleanup (no en onRegisteredSW callback)
// porque StrictMode dev double-mount duplicaría intervals permanentemente:
// el callback corre 2× pero su closure setea 2 setIntervals que no se
// limpian al unmount del primer mount.
//
// applyUpdate dispara updateServiceWorker(true) que promueve el SW de
// waiting → active y recarga. Si la activación falla silenciosamente
// (caso raro pero observable), un setTimeout fallback fuerza reload
// a los 5s para no dejar al user con banner colgado.
//
// updateServiceWorker low-level se expone para que F4 componga
// flush-before-reload (allQueues.flushAll() → updateServiceWorker(true))
// en call-site sin tocar este hook (SRP).
export default function useSwUpdate(): UseSwUpdateResult {
  const isNative = isTauri() || isCapacitor();
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: !isNative,
    onRegisteredSW(_swUrl, r) {
      if (r) registrationRef.current = r;
    },
    onRegisterError(err) {
      console.error('[sw] registration error', err);
    },
  });

  useEffect(() => {
    if (isNative) return;
    const id = window.setInterval(() => {
      registrationRef.current?.update().catch((err) => {
        console.error('[sw] update poll failed', err);
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isNative]);

  const applyUpdate = async () => {
    if (isNative) return;
    const fallbackId = window.setTimeout(() => {
      window.location.reload();
    }, RELOAD_FALLBACK_MS);
    try {
      await updateServiceWorker(true);
    } catch (err) {
      console.error('[sw] activate failed, forcing reload', err);
      window.clearTimeout(fallbackId);
      window.location.reload();
    }
  };

  return {
    needRefresh: !isNative && needRefresh,
    applyUpdate,
    updateServiceWorker,
  };
}
