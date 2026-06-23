import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_SEMANTIC_CONSENT, type SemanticConsent } from '@/types/semanticConsent';

// SPEC-66 F1: capa de datos del consentimiento de búsqueda semántica. Doc
// dedicado `users/{uid}/settings/semanticSearch` (D1). Mismo patrón de cache
// module-level + dedupe de listeners que src/lib/apiKeys.ts y preferences.ts:
// múltiples consumers (banner de búsqueda, sección de settings, hook) comparten
// un único onSnapshot. El callback incluye isLoaded para distinguir
// "default pre-snapshot" del valor real — crítico para no mostrar el banner de
// activación contra defaults antes de que llegue el doc.
//
// IMPORTANTE: las escrituras son client-side directas (setDoc) — las rules
// dejan al owner escribir su propio doc. Esto NO es la fuente de verdad del
// egreso: el server (readSemanticConsent en las CFs) SIEMPRE re-lee y verifica
// el flag, nunca confía en el cliente (D2). El cliente escribe para reflejar la
// intención del usuario; el gate server-side es lo que blinda el invariante.

type SemanticConsentListener = (state: SemanticConsent, isLoaded: boolean) => void;

interface CacheEntry {
  state: SemanticConsent;
  isLoaded: boolean;
  unsubscribe: () => void;
  listeners: Set<SemanticConsentListener>;
}

const cache = new Map<string, CacheEntry>();

function pathFor(uid: string) {
  return doc(db, `users/${uid}/settings/semanticSearch`);
}

// Parser defensivo: ausente/inválido → DEFAULT (inerte). A diferencia de
// parsePrefs NO hay `_schemaVersion` ni purga — el acknowledgedAt es evidencia
// legal y no debe poder borrarse por un mismatch (D1).
export function parseSemanticConsent(data: Record<string, unknown> | undefined): SemanticConsent {
  return {
    enabled: data?.enabled === true,
    acknowledgedAt: typeof data?.acknowledgedAt === 'number' ? data.acknowledgedAt : null,
  };
}

export function subscribeSemanticConsent(
  uid: string,
  callback: SemanticConsentListener,
): () => void {
  let entry = cache.get(uid);
  if (!entry) {
    const newEntry: CacheEntry = {
      state: DEFAULT_SEMANTIC_CONSENT,
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
        e.state = snap.exists() ? parseSemanticConsent(snap.data()) : DEFAULT_SEMANTIC_CONSENT;
        e.isLoaded = true;
        e.listeners.forEach((cb) => cb(e.state, true));
      },
      (error) => {
        console.error('[semanticConsent] onSnapshot error', error);
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

export async function loadSemanticConsent(uid: string): Promise<SemanticConsent> {
  const cached = cache.get(uid);
  if (cached?.isLoaded) return cached.state;
  const snap = await getDoc(pathFor(uid));
  return snap.exists() ? parseSemanticConsent(snap.data()) : DEFAULT_SEMANTIC_CONSENT;
}

// Reconocimiento afirmativo (§7.1): setea `enabled` + `acknowledgedAt` de forma
// ATÓMICA en un solo write. Date.now() (number) y NO serverTimestamp(): el
// modelo es `number | null`, y serverTimestamp() resolvería a null en el
// snapshot optimista local antes de confirmar server → el banner reaparecería /
// D6 fallaría. [Cabo legal: forma del acknowledgedAt, pregunta del abogado.]
export async function markSemanticConsentAcknowledged(uid: string): Promise<void> {
  await setDoc(pathFor(uid), { enabled: true, acknowledgedAt: Date.now() }, { merge: true });
}

// Activar/desactivar SIN tocar acknowledgedAt — re-activar tras desactivar no
// requiere re-reconocer si ya hay acknowledgedAt (D6). Desactivar (false)
// dispara el bulk-delete server-side (trigger F7) + la invalidación de cache.
export async function setSemanticSearchEnabled(uid: string, enabled: boolean): Promise<void> {
  await setDoc(pathFor(uid), { enabled }, { merge: true });
}

// Útil en signOut para no filtrar consentimiento entre cuentas (mismo principio
// que invalidateAiKeysCache / invalidatePreferencesCache / invalidateEmbeddingsCache).
export function invalidateSemanticConsentCache(uid?: string): void {
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
