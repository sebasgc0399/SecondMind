import { useEffect, useRef, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import { subscribePreferences } from '@/lib/preferences';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/types/preferences';

interface UsePreferencesReturn {
  preferences: UserPreferences;
}

// Wrapper React sobre subscribePreferences. La suscripción real (onSnapshot
// + cache + dedup) vive en src/lib/preferences.ts; este hook solo conecta el
// state local al callback. Pattern anti-stale con userIdRef para descartar
// callbacks de un user obsoleto si el auth cambió mid-suscripción.
export default function usePreferences(): UsePreferencesReturn {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    userIdRef.current = user?.uid ?? null;
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      return;
    }
    const uid = user.uid;
    const unsubscribe = subscribePreferences(uid, (p) => {
      if (userIdRef.current !== uid) return;
      setPreferences(p);
    });
    return unsubscribe;
  }, [user]);

  return { preferences };
}
