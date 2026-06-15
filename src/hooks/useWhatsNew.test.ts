// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useAuth from '@/hooks/useAuth';
import usePreferences from '@/hooks/usePreferences';
import useWhatsNew from '@/hooks/useWhatsNew';
import { setPreferences } from '@/lib/preferences';
import { getRunningVersion } from '@/lib/version';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/types/preferences';

// Mockeamos auth + preferences + accessor + writer. NO @/lib/changelog: usa el
// registry real → '0.6.0' resuelve a la entrada { key: 'v060' }.
vi.mock('@/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('@/hooks/usePreferences', () => ({ default: vi.fn() }));
vi.mock('@/lib/version', () => ({ getRunningVersion: vi.fn() }));
vi.mock('@/lib/preferences', () => ({ setPreferences: vi.fn() }));

const mockUseAuth = vi.mocked(useAuth);
const mockUsePreferences = vi.mocked(usePreferences);
const mockGetRunningVersion = vi.mocked(getRunningVersion);
const mockSetPreferences = vi.mocked(setPreferences);

const UID = 'u1';

function setPrefs(overrides: Partial<UserPreferences>): void {
  mockUsePreferences.mockReturnValue({
    preferences: { ...DEFAULT_PREFERENCES, ...overrides },
    isLoaded: true,
  });
}

// Resuelve getRunningVersion() (async) + deja correr el segundo effect.
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: UID } } as unknown as ReturnType<typeof useAuth>);
  setPrefs({});
  mockGetRunningVersion.mockResolvedValue('0.6.0');
  mockSetPreferences.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useWhatsNew', () => {
  it('1. estable: currentVersion === lastSeenVersion → ni modal ni write', async () => {
    setPrefs({ lastSeenVersion: '0.6.0', onboardingWelcomeSeen: true });
    mockGetRunningVersion.mockResolvedValue('0.6.0');

    const { result } = renderHook(() => useWhatsNew());
    await flush();

    expect(result.current.open).toBe(false);
    expect(result.current.entryKey).toBeNull();
    expect(mockSetPreferences).not.toHaveBeenCalled();
  });

  it('2. D9 supresión: lastSeenVersion=null && onboardingWelcomeSeen=false → silent-advance, sin modal', async () => {
    setPrefs({ lastSeenVersion: null, onboardingWelcomeSeen: false });
    mockGetRunningVersion.mockResolvedValue('0.6.0');

    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(mockSetPreferences).toHaveBeenCalled());

    expect(result.current.open).toBe(false);
    expect(result.current.entryKey).toBeNull();
    // silent-advance escribe currentVersion, nada más
    expect(mockSetPreferences).toHaveBeenCalledTimes(1);
    expect(mockSetPreferences).toHaveBeenCalledWith(UID, { lastSeenVersion: '0.6.0' });
  });

  it('3. inaugural establecido (CRÍTICO): null + welcome visto + hay entry → modal con entryKey, sin write inmediato; dismiss escribe currentVersion', async () => {
    setPrefs({ lastSeenVersion: null, onboardingWelcomeSeen: true });
    mockGetRunningVersion.mockResolvedValue('0.6.0');

    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(result.current.open).toBe(true));

    expect(result.current.entryKey).toBe('v060');
    // abrir el modal NO escribe; recién el dismiss persiste
    expect(mockSetPreferences).not.toHaveBeenCalled();

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.open).toBe(false);
    expect(mockSetPreferences).toHaveBeenCalledTimes(1);
    expect(mockSetPreferences).toHaveBeenCalledWith(UID, { lastSeenVersion: '0.6.0' });
  });

  it('4. sin entry: currentVersion !== lastSeenVersion && sin entry → silent-advance con currentVersion, sin modal', async () => {
    setPrefs({ lastSeenVersion: '0.6.0', onboardingWelcomeSeen: true });
    mockGetRunningVersion.mockResolvedValue('9.9.9'); // no está en CHANGELOG_ENTRIES

    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(mockSetPreferences).toHaveBeenCalled());

    expect(result.current.open).toBe(false);
    expect(result.current.entryKey).toBeNull();
    // escribe la versión corriendo (9.9.9), no la vieja ni otra cosa
    expect(mockSetPreferences).toHaveBeenCalledTimes(1);
    expect(mockSetPreferences).toHaveBeenCalledWith(UID, { lastSeenVersion: '9.9.9' });
  });

  it('5. fail-safe: getRunningVersion rechaza → ni modal, ni write, ni throw', async () => {
    setPrefs({ lastSeenVersion: null, onboardingWelcomeSeen: true });
    mockGetRunningVersion.mockRejectedValue(new Error('version desconocida'));

    const { result } = renderHook(() => useWhatsNew());
    await flush();

    expect(result.current.open).toBe(false);
    expect(result.current.entryKey).toBeNull();
    expect(mockSetPreferences).not.toHaveBeenCalled();
  });
});
