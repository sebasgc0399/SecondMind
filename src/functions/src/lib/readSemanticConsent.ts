import * as admin from 'firebase-admin';
import { appError } from './appError';

// SPEC-66 F2/D2 + consent server-authoritative (Opción 3) — lectura server-side
// autoritativa del consentimiento de búsqueda semántica. Se lee con Admin SDK
// (bypassa rules). Es la ÚNICA fuente de verdad del egreso a OpenAI (gate del
// invariante §7.1). Fail-closed: input inválido / sin ack / parcial → inerte.
//
// El ack-proof (acknowledgedAt:number) NO se deriva del doc vivo client-writable
// `users/{uid}/settings/semanticSearch` — eso sería forjable (las rules dejan al
// owner escribir su settings). Se deriva del doc RESUMEN deny-all
// `consentLog/{uid}` que SOLO el callable markSemanticConsent mintea. El doc vivo
// aporta únicamente `enabled` (el toggle on/off del usuario): forjarlo no abre
// egreso porque sin ack-proof en el resumen el AND del invariante niega igual.

export interface SemanticConsentState {
  enabled: boolean;
  acknowledgedAt: number | null;
}

const INERT: SemanticConsentState = { enabled: false, acknowledgedAt: null };

export async function readSemanticConsent(userId: string): Promise<SemanticConsentState> {
  if (typeof userId !== 'string' || !userId) return INERT;
  const db = admin.firestore();
  // 1) Ack-proof del doc resumen deny-all (NO forjable). Si no hay reconocimiento
  // registrado, fail-closed YA — sin leer el doc vivo (el AND del invariante niega
  // igual, así que ahorramos el read en el caso común "sin consentimiento").
  const summarySnap = await db.doc(`consentLog/${userId}`).get();
  const rawAck = summarySnap.exists ? summarySnap.data()?.acknowledgedAt : undefined;
  const acknowledgedAt = typeof rawAck === 'number' ? rawAck : null;
  if (acknowledgedAt === null) return INERT;
  // 2) enabled del doc vivo (toggle on/off del usuario; client-writable e inocuo).
  const liveSnap = await db.doc(`users/${userId}/settings/semanticSearch`).get();
  const enabled = liveSnap.exists && liveSnap.data()?.enabled === true;
  return { enabled, acknowledgedAt };
}

// El invariante (§7.1): hay egreso de texto a OpenAI SOLO si el usuario habilitó
// (enabled) Y hay un reconocimiento registrado (acknowledgedAt number). Exigir
// AMBOS — "sin egreso sin reconocimiento registrado" — blinda contra un cliente
// que escriba enabled=true sin pasar por el modal (puede, por las rules).
// [Cabo legal: la forma del acknowledgedAt es pregunta del abogado, junto a D3/D4.]
export function isSemanticConsentGranted(consent: SemanticConsentState): boolean {
  return consent.enabled === true && typeof consent.acknowledgedAt === 'number';
}

// SPEC-66 F3 — gate para callables (embedQuery): re-lee el consentimiento
// server-side y lanza permission-denied si no hay reconocimiento registrado. Es
// la defensa AUTORITATIVA del egreso de la query: el gating cliente
// (useHybridSearch) es solo UX para no llamar en vano; si el cliente fallara,
// este assert igual rechaza. Slug `semantic-search-disabled` para el cliente.
export async function assertSemanticConsent(userId: string): Promise<void> {
  const consent = await readSemanticConsent(userId);
  if (!isSemanticConsentGranted(consent)) {
    throw appError(
      'semantic-search-disabled',
      'permission-denied',
      'La búsqueda semántica no está habilitada',
    );
  }
}
