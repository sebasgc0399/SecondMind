// SPEC-66: estado del consentimiento de búsqueda semántica. Vive en un doc
// DEDICADO `users/{uid}/settings/semanticSearch` (NO en settings/preferences)
// para aislar el `acknowledgedAt` — evidencia legal del reconocimiento de §7.1
// del ToS — de la semántica purge-on-schema-mismatch de parsePrefs (D1). Este
// doc NO lleva `_schemaVersion` ni purga: futuros campos serían aditivos con
// default, nunca purga (un consentimiento legal no puede borrarse por un bump).
export interface SemanticConsent {
  // true = el usuario habilitó la búsqueda semántica tras el reconocimiento
  // afirmativo. Ausente/inválido → false = INERTE: ni un embedding se genera,
  // ni un carácter de texto sale a OpenAI (el invariante legal de §7.1).
  enabled: boolean;
  // Timestamp (epoch ms) del reconocimiento afirmativo, en el doc VIVO. Lo
  // escribe el callable server-side `markSemanticConsent` (no más setDoc client).
  // Es señal de UX/D6 (decidir si re-prompt), client-readable: persiste aunque
  // luego desactive (re-activar no requiere re-reconocer, D6). null = nunca
  // reconoció. FORJABLE pero INOCUO: el gate de egreso NO lo usa como prueba —
  // la prueba server-authoritative (no forjable) vive en el doc resumen deny-all
  // `consentLog/{uid}` que solo el server lee. Acá es intención, no evidencia.
  acknowledgedAt: number | null;
}

export const DEFAULT_SEMANTIC_CONSENT: SemanticConsent = {
  enabled: false,
  acknowledgedAt: null,
};

// Versión del aviso §7.1 que el usuario reconoce (gemela de la constante FUNCTIONS
// en src/functions/src/lib/semanticNoticeVersion.ts; un test de paridad las obliga
// a coincidir). Co-locada con el modal del aviso. Bumpear SOLO cuando el texto del
// aviso cambie materialmente — y en lockstep con la gemela functions.
export const SEMANTIC_NOTICE_VERSION = 1;
