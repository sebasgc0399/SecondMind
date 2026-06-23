import * as admin from 'firebase-admin';

// SPEC-66 F2/D2 — lectura server-side autoritativa del consentimiento de
// búsqueda semántica. Vive en el doc dedicado `users/{uid}/settings/semanticSearch`
// (D1). Se lee con Admin SDK (bypassa rules). Es la ÚNICA fuente de verdad del
// egreso a OpenAI: las rules dejan al owner escribir su propio flag, así que el
// server NUNCA confía en el cliente — siempre re-lee acá (gate del invariante de
// §7.1). Fail-closed: input inválido / doc ausente / parcial → inerte.

export interface SemanticConsentState {
  enabled: boolean;
  acknowledgedAt: number | null;
}

const INERT: SemanticConsentState = { enabled: false, acknowledgedAt: null };

export async function readSemanticConsent(userId: string): Promise<SemanticConsentState> {
  if (typeof userId !== 'string' || !userId) return INERT;
  const snap = await admin.firestore().doc(`users/${userId}/settings/semanticSearch`).get();
  if (!snap.exists) return INERT;
  const data = snap.data();
  return {
    enabled: data?.enabled === true,
    acknowledgedAt: typeof data?.acknowledgedAt === 'number' ? data.acknowledgedAt : null,
  };
}

// El invariante (§7.1): hay egreso de texto a OpenAI SOLO si el usuario habilitó
// (enabled) Y hay un reconocimiento registrado (acknowledgedAt number). Exigir
// AMBOS — "sin egreso sin reconocimiento registrado" — blinda contra un cliente
// que escriba enabled=true sin pasar por el modal (puede, por las rules).
// [Cabo legal: la forma del acknowledgedAt es pregunta del abogado, junto a D3/D4.]
export function isSemanticConsentGranted(consent: SemanticConsentState): boolean {
  return consent.enabled === true && typeof consent.acknowledgedAt === 'number';
}
