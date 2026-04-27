import { useEffect, useRef, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import { subscribePreferences } from '@/lib/preferences';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/types/preferences';

interface UsePreferencesReturn {
  preferences: UserPreferences;
  isLoaded: boolean;
}

// Wrapper React sobre subscribePreferences. La suscripción real (onSnapshot
// + cache + dedup) vive en src/lib/preferences.ts; este hook solo conecta el
// state local al callback. Pattern anti-stale con userIdRef para descartar
// callbacks de un user obsoleto si el auth cambió mid-suscripción.
//
// `isLoaded` distingue "tengo defaults pre-snapshot" de "tengo el valor real
// del Firestore". Consumers que disparan side-effects basados en flags
// (auto-popover, banners one-time) deben esperar isLoaded=true antes de
// actuar — sino disparan contra defaults y pisan el valor real cuando llega.
export default function usePreferences(): UsePreferencesReturn {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    userIdRef.current = user?.uid ?? null;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- subscription stream lifecycle: reset a defaults al sign-out antes del cleanup del onSnapshot. Sin esto, valores del user anterior persisten hasta el próximo sign-in
      setPreferences(DEFAULT_PREFERENCES);
      setIsLoaded(false);
      return;
    }
    const uid = user.uid;
    setIsLoaded(false);
    const unsubscribe = subscribePreferences(uid, (p, loaded) => {
      if (userIdRef.current !== uid) return;
      setPreferences(p);
      setIsLoaded(loaded);
    });
    return unsubscribe;
  }, [user]);

  return { preferences, isLoaded };
}
