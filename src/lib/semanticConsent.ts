import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { DEFAULT_SEMANTIC_CONSENT, type SemanticConsent } from '@/types/semanticConsent';

// SPEC-66 F1: capa de datos del consentimiento de búsqueda semántica. Doc
// dedicado `users/{uid}/settings/semanticSearch` (D1). Mismo patrón de cache
// module-level + dedupe de listeners que src/lib/apiKeys.ts y preferences.ts:
// múltiples consumers (banner de búsqueda, sección de settings, hook) comparten
// un único onSnapshot. El callback incluye isLoaded para distinguir
// "default pre-snapshot" del valor real — crítico para no mostrar el banner de
// activación contra defaults antes de que llegue el doc.
//
// IMPORTANTE (consent server-authoritative / Opción 3): el RECONOCIMIENTO ya NO
// se escribe client-side — pasa por el callable `markSemanticConsent`, que mintea
// el ack-proof NO forjable en un doc resumen deny-all que solo el server lee. El
// toggle on/off (setSemanticSearchEnabled) SÍ sigue client-side (setDoc al doc
// vivo): es la intención del usuario, inocua, y el gate de egreso exige ADEMÁS el
// ack-proof server-only. Las LECTURAS del cliente siguen sobre el doc vivo (única
// fuente client-readable): su `acknowledgedAt` es señal de UX/D6, no la evidencia.

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

// Refleja un estado en la cache ANTES de que llegue el onSnapshot (optimista).
// Solo si ya hay una suscripción viva para el uid (si no, el próximo subscribe
// levanta el valor real del server igual). El onSnapshot posterior re-emite el
// mismo estado → idempotente. Restaura el reflejo inmediato que daba el setDoc
// local (Firestore optimistic write) antes de migrar el ack a un callable RPC.
function optimisticConsentUpdate(uid: string, next: SemanticConsent): void {
  const entry = cache.get(uid);
  if (!entry) return;
  entry.state = next;
  entry.isLoaded = true;
  entry.listeners.forEach((cb) => cb(next, true));
}

const markSemanticConsentFn = httpsCallable<
  { locale: string; appVersion?: string },
  { ok: true; acknowledgedAt: number }
>(functions, 'markSemanticConsent');

// Reconocimiento afirmativo (§7.1) — consent server-authoritative (Opción 3): ya
// NO es un setDoc client-side, sino el callable `markSemanticConsent`. El server
// (requireVerified + assertAllowlisted) escribe atómico el doc vivo + el ack-proof
// NO forjable en consentLog/{uid} + el evento de evidencia. `locale`/`appVersion`
// = metadata del aviso mostrado (evidencia). Tras resolver, reflejamos el ack en
// la cache local (el onSnapshot del doc vivo tarda ~100-500ms vs el reflejo
// instantáneo del viejo setDoc; sin esto D6 podría reabrir el modal en un toggle
// rápido).
export async function markSemanticConsentAcknowledged(
  uid: string,
  locale: string,
  appVersion?: string,
): Promise<void> {
  const res = await markSemanticConsentFn({ locale, appVersion });
  const ackAt = res.data?.acknowledgedAt;
  if (typeof ackAt === 'number') {
    optimisticConsentUpdate(uid, { enabled: true, acknowledgedAt: ackAt });
  }
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
