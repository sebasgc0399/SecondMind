// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { Provider } from 'tinybase/ui-react';
import { notesStore } from '@/stores/notesStore';
import useOnboarding from '@/hooks/useOnboarding';

const { USER, PREFS, KEYS } = vi.hoisted(() => ({
  USER: { uid: 'u1' },
  PREFS: { onboardingWelcomeSeen: false, onboardingChecklistDismissed: false },
  KEYS: { anthropic: { configured: false } },
}));
vi.mock('@/hooks/useAuth', () => ({ default: () => ({ user: USER }) }));
vi.mock('@/hooks/usePreferences', () => ({
  default: () => ({ preferences: PREFS, isLoaded: true }),
}));
vi.mock('@/hooks/useApiKeys', () => ({
  default: () => ({ apiKeys: KEYS, isLoaded: true }),
}));
vi.mock('@/hooks/useQuickCapture', () => ({ default: () => ({ open: vi.fn() }) }));
vi.mock('@/hooks/useStoreHydration', () => ({
  useStoreHydration: () => ({ isHydrating: false }),
}));
vi.mock('@/lib/preferences', () => ({ setPreferences: vi.fn() }));

const TRASHED = 1_700_000_000_000;

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={notesStore}>{children}</Provider>;
}

function firstNoteDone(): boolean {
  const { result } = renderHook(() => useOnboarding(), { wrapper });
  return result.current.steps.find((s) => s.id === 'firstNote')!.done;
}

describe('useOnboarding.firstNoteDone', () => {
  beforeEach(() => {
    notesStore.delTables();
  });

  it('no se cumple solo con una nota en la papelera', () => {
    notesStore.setRow('notes', 'papelera', { title: 'P', deletedAt: TRASHED });
    expect(firstNoteDone()).toBe(false);
  });

  it('se cumple con una nota viva', () => {
    notesStore.setRow('notes', 'papelera', { title: 'P', deletedAt: TRASHED });
    notesStore.setRow('notes', 'viva', { title: 'V' });
    expect(firstNoteDone()).toBe(true);
  });
});
