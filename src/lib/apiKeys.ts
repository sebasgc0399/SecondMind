import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { DEFAULT_AI_KEYS, type AiKeysState, type ApiKeyProvider } from '@/types/apiKey';

// Cache module-level por uid + dedupe de listeners (mismo patrón que
// src/lib/preferences.ts). Múltiples consumers (ej. N InboxItemCard)
// comparten un único onSnapshot; el cleanup desuscribe cuando el último
// listener se va. La firma del callback incluye isLoaded para distinguir
// "defaults pre-snapshot" de "valor real" — crítico para no mostrar el
// empty state F7 contra defaults antes de que llegue el doc real.

type AiKeysListener = (state: AiKeysState, isLoaded: boolean) => void;

interface CacheEntry {
  state: AiKeysState;
  isLoaded: boolean;
  unsubscribe: () => void;
  listeners: Set<AiKeysListener>;
}

const cache = new Map<string, CacheEntry>();

function pathFor(uid: string) {
  return doc(db, `users/${uid}/settings/aiKeys`);
}

function parseAiKeys(data: Record<string, unknown> | undefined): AiKeysState {
  const anthropic = data?.anthropic as Record<string, unknown> | undefined;
  return {
    anthropic: {
      configured: anthropic?.configured === true,
      last4: typeof anthropic?.last4 === 'string' ? anthropic.last4 : null,
    },
  };
}

export function subscribeAiKeys(uid: string, callback: AiKeysListener): () => void {
  let entry = cache.get(uid);
  if (!entry) {
    const newEntry: CacheEntry = {
      state: DEFAULT_AI_KEYS,
      isLoaded: false,
      listeners: new Set(),
      unsubscribe: () => {},
    };
    cache.set(uid, newEntry);
    newEntry.unsubscribe = onSnapshot(
      pathFor(uid),
      (snap) => {
        const e = cache.get(uid);
        if (!e) return;
        e.state = snap.exists() ? parseAiKeys(snap.data()) : DEFAULT_AI_KEYS;
        e.isLoaded = true;
        e.listeners.forEach((cb) => cb(e.state, true));
      },
      (error) => {
        console.error('[apiKeys] onSnapshot error', error);
      },
    );
    entry = newEntry;
  }

  entry.listeners.add(callback);
  if (entry.isLoaded) callback(entry.state, true);

  return () => {
    const e = cache.get(uid);
    if (!e) return;
    e.listeners.delete(callback);
    if (e.listeners.size === 0) {
      e.unsubscribe();
      cache.delete(uid);
    }
  };
}

// Útil en signOut para no filtrar metadata entre cuentas (mismo principio
// que invalidatePreferencesCache / invalidateEmbeddingsCache).
export function invalidateAiKeysCache(uid?: string): void {
  if (uid) {
    const entry = cache.get(uid);
    if (entry) {
      entry.unsubscribe();
      cache.delete(uid);
    }
    return;
  }
  cache.forEach((entry) => entry.unsubscribe());
  cache.clear();
}

// Callables BYOK (F2): saveApiKey valida + cifra server-side; deleteApiKey
// borra. La key en claro viaja una sola vez por TLS y nunca vuelve.
const saveApiKeyFn = httpsCallable<
  { provider: ApiKeyProvider; key: string },
  { ok: true; last4: string }
>(functions, 'saveApiKey');

const deleteApiKeyFn = httpsCallable<{ provider: ApiKeyProvider }, { ok: true }>(
  functions,
  'deleteApiKey',
);

export async function saveApiKey(provider: ApiKeyProvider, key: string): Promise<string> {
  const result = await saveApiKeyFn({ provider, key });
  return result.data.last4;
}

export async function deleteApiKey(provider: ApiKeyProvider): Promise<void> {
  await deleteApiKeyFn({ provider });
}
