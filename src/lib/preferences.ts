import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { db } from '@/lib/firebase';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/types/preferences';

// Primer doc-único onSnapshot del proyecto. Cuando se acumulen N>3 prefs,
// considerar migrar a tabla TinyBase via persister para unificar con F11/F12
// (cleanup cross-user) y evitar fragmentar consistencia.
//
// Cache module-level por uid + dedupe de listeners (mismo patrón que
// src/lib/embeddings.ts). Múltiples consumers comparten el mismo onSnapshot;
// el cleanup desuscribe automáticamente cuando el último listener se va.
//
// Callback firma incluye isLoaded para que consumers puedan distinguir
// "estoy entregando defaults pre-snapshot" de "tengo el valor real". Sin
// esto, side-effects basados en flags como distillIntroSeen disparan
// contra defaults antes de que llegue el valor persistido.

type PreferencesListener = (prefs: UserPreferences, isLoaded: boolean) => void;

interface CacheEntry {
  prefs: UserPreferences;
  isLoaded: boolean;
  unsubscribe: () => void;
  listeners: Set<PreferencesListener>;
}

const cache = new Map<string, CacheEntry>();

function pathFor(uid: string) {
  return doc(db, `users/${uid}/settings/preferences`);
}

export function parsePrefs(data: Record<string, unknown> | undefined): UserPreferences {
  const days = data?.trashAutoPurgeDays;
  const banners = data?.distillBannersSeen as Record<string, unknown> | undefined;
  return {
    trashAutoPurgeDays:
      days === 0 || days === 7 || days === 15 || days === 30
        ? days
        : DEFAULT_PREFERENCES.trashAutoPurgeDays,
    distillIntroSeen: data?.distillIntroSeen === true,
    distillBannersSeen: {
      l1: banners?.l1 === true,
      l2: banners?.l2 === true,
      l3: banners?.l3 === true,
    },
    sidebarHidden: data?.sidebarHidden === true,
  };
}

export function subscribePreferences(uid: string, callback: PreferencesListener): () => void {
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
        e.listeners.forEach((cb) => cb(e.prefs, true));
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
  if (entry.isLoaded) callback(entry.prefs, true);

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

// Helper específico para marcar que el banner de transición a un nivel
// ya fue visto. Usa dot-notation con `updateDoc` para crear/actualizar
// el path nested sin race de closure stale: si dos banners disparan
// rápido y ambos leen `preferences` del mismo snapshot React, ninguno
// sobrescribe al otro porque cada `updateDoc` toca solo su path.
//
// CRITICO: `setDoc({merge:true})` con dot-notation NO crea estructura
// nested — guarda literal el campo con punto en la key (`"a.b"`).
// Solo `updateDoc` interpreta dot-notation. Si el doc no existe,
// updateDoc falla con `not-found` y caemos a setDoc con objeto nested
// (race nulo porque no había nada que pisar).
export async function markDistillBannerSeen(uid: string, level: 1 | 2 | 3): Promise<void> {
  const ref = pathFor(uid);
  try {
    await updateDoc(ref, { [`distillBannersSeen.l${level}`]: true });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'not-found') {
      await setDoc(ref, { distillBannersSeen: { [`l${level}`]: true } }, { merge: true });
      return;
    }
    throw error;
  }
}

// Anti-flash hint para sidebarHidden (F32.4): cachea el último valor
// persistido en localStorage por uid. Permite que usePreferences hidrate
// el state sincrónamente antes del primer onSnapshot (~100-300ms),
// eliminando el flash sidebar→TopBar al cargar para usuarios con
// hidden=true persistido. Solo afecta UI layout — los demás campos
// (distillIntroSeen, distillBannersSeen, trashAutoPurgeDays) siguen
// gobernados por el isLoaded gate de usePreferences porque dispararían
// side-effects con hint stale.
//
// La key incluye uid para no contaminar entre cuentas en multi-account
// browsers. Sign-out NO limpia el hint — el próximo login del mismo
// uid hidrata correcto.
const SIDEBAR_HIDDEN_HINT_KEY_PREFIX = 'secondmind:sidebarHidden:';

export function readSidebarHiddenHint(uid: string): boolean | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_HIDDEN_HINT_KEY_PREFIX + uid);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    // localStorage no disponible (private browsing iOS, storage deshabilitado).
    // Fallback silencioso al comportamiento F31 (sin hint).
    return null;
  }
}

export function writeSidebarHiddenHint(uid: string, value: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_HIDDEN_HINT_KEY_PREFIX + uid, value ? 'true' : 'false');
  } catch {
    // Silent: ver readSidebarHiddenHint.
  }
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
