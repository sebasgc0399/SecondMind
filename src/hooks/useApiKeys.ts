import { useCallback, useEffect, useRef, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import { subscribeAiKeys, saveApiKey, deleteApiKey } from '@/lib/apiKeys';
import { mapApiKeyError } from '@/lib/apiKeyErrors';
import { DEFAULT_AI_KEYS, type AiKeysState, type ApiKeyProvider } from '@/types/apiKey';

interface UseApiKeysReturn {
  apiKeys: AiKeysState;
  isLoaded: boolean;
  saving: boolean;
  error: string | null;
  saveKey: (provider: ApiKeyProvider, key: string) => Promise<boolean>;
  removeKey: (provider: ApiKeyProvider) => Promise<boolean>;
}

// Wrapper React sobre subscribeAiKeys (onSnapshot + cache + dedup en
// src/lib/apiKeys.ts). Pattern anti-stale con userIdRef para descartar
// callbacks de un user obsoleto. `isLoaded` distingue defaults pre-snapshot
// del valor real — consumers que gatean UI (banner F7) deben esperar
// isLoaded=true antes de actuar.
export default function useApiKeys(): UseApiKeysReturn {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<AiKeysState>(DEFAULT_AI_KEYS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    userIdRef.current = user?.uid ?? null;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- subscription stream lifecycle: reset a defaults al sign-out antes del cleanup del onSnapshot
      setApiKeys(DEFAULT_AI_KEYS);
      setIsLoaded(false);
      return;
    }
    const uid = user.uid;
    setIsLoaded(false);
    const unsubscribe = subscribeAiKeys(uid, (state, loaded) => {
      if (userIdRef.current !== uid) return;
      setApiKeys(state);
      setIsLoaded(loaded);
    });
    return unsubscribe;
  }, [user]);

  const saveKey = useCallback(async (provider: ApiKeyProvider, key: string): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await saveApiKey(provider, key);
      return true;
    } catch (err) {
      setError(mapApiKeyError(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const removeKey = useCallback(async (provider: ApiKeyProvider): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await deleteApiKey(provider);
      return true;
    } catch (err) {
      setError(mapApiKeyError(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { apiKeys, isLoaded, saving, error, saveKey, removeKey };
}
