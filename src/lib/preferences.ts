import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/types/preferences';

// Primer doc-único onSnapshot del proyecto. Cuando se acumulen N>3 prefs,
// considerar migrar a tabla TinyBase via persister para unificar con F11/F12
// (cleanup cross-user) y evitar fragmentar consistencia.
//
// Cache module-level por uid + dedupe de listeners (mismo patrón que
// src/lib/embeddings.ts). Múltiples consumers comparten el mismo onSnapshot;
// el cleanup desuscribe automáticamente cuando el último listener se va.

interface CacheEntry {
  prefs: UserPreferences;
  isLoaded: boolean;
  unsubscribe: () => void;
  listeners: Set<(prefs: UserPreferences) => void>;
}

const cache = new Map<string, CacheEntry>();

function pathFor(uid: string) {
  return doc(db, `users/${uid}/settings/preferences`);
}

const VALID_NOTE_TYPES = ['fleeting', 'literature', 'permanent'];

function parsePrefs(data: Record<string, unknown> | undefined): UserPreferences {
  const days = data?.trashAutoPurgeDays;
  const noteType = data?.defaultNoteType;
  return {
    trashAutoPurgeDays:
      days === 0 || days === 7 || days === 15 || days === 30
        ? days
        : DEFAULT_PREFERENCES.trashAutoPurgeDays,
    defaultNoteType:
      typeof noteType === 'string' && VALID_NOTE_TYPES.includes(noteType)
        ? (noteType as UserPreferences['defaultNoteType'])
        : DEFAULT_PREFERENCES.defaultNoteType,
  };
}

export function subscribePreferences(
  uid: string,
  callback: (prefs: UserPreferences) => void,
): () => void {
  let entry = cache.get(uid);
  if (!entry) {
    const newEntry: CacheEntry = {
      prefs: DEFAULT_PREFERENCES,
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
        e.prefs = snap.exists() ? parsePrefs(snap.data()) : DEFAULT_PREFERENCES;
        e.isLoaded = true;
        e.listeners.forEach((cb) => cb(e.prefs));
      },
      (error) => {
        console.error('[preferences] onSnapshot error', error);
      },
    );
    entry = newEntry;
  }

  entry.listeners.add(callback);
  // Si ya hay datos cacheados, entregar inmediato (nuevo subscriber tarde
  // a la fiesta no debería esperar al próximo snapshot).
  if (entry.isLoaded) callback(entry.prefs);

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

export async function loadPreferences(uid: string): Promise<UserPreferences> {
  const cached = cache.get(uid);
  if (cached?.isLoaded) return cached.prefs;
  const snap = await getDoc(pathFor(uid));
  if (!snap.exists()) return DEFAULT_PREFERENCES;
  return parsePrefs(snap.data());
}

export async function setPreferences(
  uid: string,
  partial: Partial<UserPreferences>,
): Promise<void> {
  await setDoc(pathFor(uid), partial, { merge: true });
}

// Útil en signOut para no filtrar prefs entre cuentas (mismo principio que
// invalidateEmbeddingsCache en src/lib/embeddings.ts).
export function invalidatePreferencesCache(uid?: string): void {
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
