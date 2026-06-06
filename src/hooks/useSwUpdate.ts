import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const POLL_INTERVAL_MS = 60 * 60 * 1000;
const RELOAD_FALLBACK_MS = 5000;

interface UseSwUpdateResult {
  needRefresh: boolean;
  applyUpdate: () => Promise<void>;
  updateServiceWorker: (reload?: boolean) => Promise<void>;
}

// Wrapper liviano sobre useRegisterSW de virtual:pwa-register/react.
//
// SOLO se monta en web. UpdateBanner gatea su subtree con
// `if (isTauri() || isCapacitor()) return null` ANTES de cualquier hook, así
// que esta cadena (useSwUpdate → useRegisterSW → register()) nunca corre en
// native. Ese mount-gate es lo que previene el registro del SW en native —
// NO el flag `immediate`. En vite-plugin-pwa `immediate` solo controla CUÁNDO
// registra (`load` vs ya), no SI registra: `register()` se llama incondicional
// en el fuente del plugin. Confundir eso fue el root cause del cache stale en
// Android — el SW se registraba igual, precacheaba el bundle cache-first y
// servía assets viejos tras el update del APK (el SW + Cache Storage persisten
// en app_webview/ a través de la reinstalación). Ver plan native-sw-cache-stale.
//
// Polling vive en useEffect con cleanup (no en onRegisteredSW callback) porque
// StrictMode dev double-mount duplicaría intervals permanentemente: el callback
// corre 2× pero su closure setea 2 setIntervals que no se limpian al unmount
// del primer mount.
//
// applyUpdate dispara updateServiceWorker(true) que promueve el SW de waiting →
// active y recarga. Si la activación falla silenciosamente (caso raro pero
// observable), un setTimeout fallback fuerza reload a los 5s para no dejar al
// user con banner colgado.
//
// updateServiceWorker low-level se expone para que useFlushThenUpdate componga
// flush-before-reload (allQueues.flushAll() → updateServiceWorker(true)) en
// call-site sin tocar este hook (SRP).
export default function useSwUpdate(): UseSwUpdateResult {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, r) {
      if (r) registrationRef.current = r;
    },
    onRegisterError(err) {
      console.error('[sw] registration error', err);
    },
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      registrationRef.current?.update().catch((err) => {
        console.error('[sw] update poll failed', err);
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const applyUpdate = async () => {
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
    needRefresh,
    applyUpdate,
    updateServiceWorker,
  };
}
