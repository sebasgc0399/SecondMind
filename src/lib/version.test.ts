import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCapacitor } from '@/lib/capacitor';
import { isTauri } from '@/lib/tauri';
import { getRunningVersion } from '@/lib/version';

// Primer test del repo que mockea los guards de plataforma + imports dinámicos
// native. Factories con vi.fn() para poder flipear el retorno por test.
vi.mock('@/lib/capacitor', () => ({ isCapacitor: vi.fn(() => false) }));
vi.mock('@/lib/tauri', () => ({ isTauri: vi.fn(() => false) }));
vi.mock('@capacitor/app', () => ({
  App: { getInfo: vi.fn(async () => ({ name: 'x', id: 'x', build: '1', version: '9.9.9' })) },
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(async () => '8.8.8') }));

// __APP_VERSION__ lo inyecta el `define` de Vite en build/dev; bajo Vitest no
// existe → stub global para la rama web. Aislado al test, sin tocar config.
vi.stubGlobal('__APP_VERSION__', '7.7.7');

const mockIsCapacitor = vi.mocked(isCapacitor);
const mockIsTauri = vi.mocked(isTauri);

afterEach(() => {
  vi.clearAllMocks();
});

describe('getRunningVersion', () => {
  it('Android (isCapacitor) → App.getInfo().version', async () => {
    mockIsCapacitor.mockReturnValue(true);
    mockIsTauri.mockReturnValue(false);
    await expect(getRunningVersion()).resolves.toBe('9.9.9');
  });

  it('Tauri (isTauri) → getVersion()', async () => {
    mockIsCapacitor.mockReturnValue(false);
    mockIsTauri.mockReturnValue(true);
    await expect(getRunningVersion()).resolves.toBe('8.8.8');
  });

  it('web (else) → __APP_VERSION__', async () => {
    mockIsCapacitor.mockReturnValue(false);
    mockIsTauri.mockReturnValue(false);
    await expect(getRunningVersion()).resolves.toBe('7.7.7');
  });
});
