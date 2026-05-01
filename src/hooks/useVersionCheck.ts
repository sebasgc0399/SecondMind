import { useEffect, useRef } from 'react';
import { isTauri } from '@/lib/tauri';
import { isCapacitor } from '@/lib/capacitor';

const STORAGE_KEY = 'secondmind:lastSeenVersion';
const RETRY_KEY = 'secondmind:versionCheckRetries';
const MAX_RETRIES = 2;

// F36.F7: detecta version mismatch entre el bundle actual y la última observada
// en instalación nativa. Tras un auto-update Tauri/Capacitor el binario nuevo
// trae el bundle nuevo en filesystem, pero el SW de versiones ≤v0.2.1 (que se
// registró con `registerType: 'autoUpdate'` default) sigue vivo en el WebView
// y sirve assets cacheados — síntoma: shell viejo hasta Ctrl+Shift+R.
//
// El check purga `caches` + unregister SW + reload UNA vez. localStorage
// sobrevive (no se purga); IndexedDB tampoco (Firebase auth + TinyBase
// persisters viven ahí — sus invariantes son ortogonales al cache HTTP).
//
// `lastSeen === null` SE TRATA como mismatch: la cohorte heredada v0.2.1 nunca
// registró marca pero TIENE SW vivo. Tratar null como match dejaría el SW
// activo. Costo: instalaciones nuevas también purgan (no-op real, `caches.keys()`
// retorna [] y `getRegistrations()` también).
//
// Asunción: package.json:version === tauri.conf.json:version === Cargo.toml.
// El skill release-ecosystem mantiene el invariante. Drift humano causaría
// reload-loop una vez por boot — mitigado por RETRY_KEY counter.
export default function useVersionCheck(): void {
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!isTauri() && !isCapacitor()) return;

    const current = __APP_VERSION__;
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    if (lastSeen === current) return;

    void (async () => {
      try {
        if ('caches' in self) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          console.log(`[useVersionCheck] purging ${regs.length} SW registration(s)`);
          await Promise.all(regs.map((r) => r.unregister()));
        }
        localStorage.setItem(STORAGE_KEY, current);
        localStorage.removeItem(RETRY_KEY);
        window.location.reload();
      } catch (err) {
        console.error('[useVersionCheck] purge failed', err);
        const retries = Number(localStorage.getItem(RETRY_KEY) ?? '0');
        if (retries < MAX_RETRIES) {
          localStorage.setItem(RETRY_KEY, String(retries + 1));
        } else {
          localStorage.removeItem(RETRY_KEY);
          localStorage.setItem(STORAGE_KEY, current);
        }
      }
    })();
  }, []);
}
