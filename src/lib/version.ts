import { isCapacitor } from '@/lib/capacitor';
import { isTauri } from '@/lib/tauri';

/**
 * Versión que está corriendo, uniforme en los 3 frentes (F59). Orden del
 * branching: `isCapacitor()` es true SOLO en Android nativo e `isTauri()` es
 * false en Android → sin solape; web es el `else`. Imports dinámicos en las
 * ramas native para no inflar el bundle web (espeja AppInfoSection /
 * useShareIntent). Async porque `getInfo()`/`getVersion()` lo son; la rama web
 * envuelve el valor síncrono de `__APP_VERSION__` (define de vite.config.ts,
 * leído POST-reload — nunca para detectar updates).
 */
export async function getRunningVersion(): Promise<string> {
  if (isCapacitor()) {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return info.version;
  }
  if (isTauri()) {
    const { getVersion } = await import('@tauri-apps/api/app');
    return getVersion();
  }
  return __APP_VERSION__;
}
