import { useEffect, useRef, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import usePreferences from '@/hooks/usePreferences';
import { findChangelogEntry, type ChangelogKey } from '@/lib/changelog';
import { setPreferences } from '@/lib/preferences';
import { getRunningVersion } from '@/lib/version';

interface UseWhatsNewReturn {
  open: boolean;
  entryKey: ChangelogKey | null;
  dismiss: () => void;
}

/**
 * Elegibilidad del modal what's-new (F59). Resuelve la versión corriendo +
 * `lastSeenVersion` (Firestore) y, una vez ambos disponibles (`isLoaded`),
 * decide una sola vez por sesión:
 * - **D9 instalación nueva** (`lastSeenVersion === null && onboardingWelcomeSeen
 *   === false`) → silent-advance, sin modal (mutua exclusión con WelcomeModal).
 *   El usuario establecido con campo nuevo (welcome ya visto) SÍ ve la entrada.
 * - versión cambió + hay entrada de catálogo → abre el modal.
 * - versión cambió sin entrada → silent-advance.
 * `handledRef` cubre AMBAS ramas (modal y silent-advance) para no re-disparar el
 * write mientras converge el snapshot. Fail-safe: si `getRunningVersion()`
 * rechaza, `currentVersion` queda null → no-op (sin modal, sin write, sin crash).
 */
export default function useWhatsNew(): UseWhatsNewReturn {
  const { user } = useAuth();
  const { preferences, isLoaded } = usePreferences();
  const [state, setState] = useState<{ open: boolean; entryKey: ChangelogKey | null }>({
    open: false,
    entryKey: null,
  });
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getRunningVersion()
      .then((v) => {
        if (!cancelled) setCurrentVersion(v);
      })
      .catch(() => {
        /* versión desconocida → no-op */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (handledRef.current) return;
    if (!user || !isLoaded || currentVersion === null) return;
    if (currentVersion === preferences.lastSeenVersion) return;

    handledRef.current = true;

    const isFreshInstall =
      preferences.lastSeenVersion === null && preferences.onboardingWelcomeSeen === false;
    const entry = isFreshInstall ? undefined : findChangelogEntry(currentVersion);

    if (entry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-open one-shot post-hidratación (gate isLoaded + handledRef previene re-disparo). Patrón canónico WelcomeModal/DistillIndicator
      setState({ open: true, entryKey: entry.key });
    } else {
      void setPreferences(user.uid, { lastSeenVersion: currentVersion });
    }
  }, [
    user,
    isLoaded,
    currentVersion,
    preferences.lastSeenVersion,
    preferences.onboardingWelcomeSeen,
  ]);

  const dismiss = () => {
    setState((s) => ({ ...s, open: false }));
    if (user && currentVersion) {
      void setPreferences(user.uid, { lastSeenVersion: currentVersion });
    }
  };

  return { open: state.open, entryKey: state.entryKey, dismiss };
}
