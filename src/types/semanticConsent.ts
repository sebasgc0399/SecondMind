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
  // Timestamp (epoch ms, Date.now()) del reconocimiento afirmativo. Es la
  // evidencia de que el usuario vio y aceptó el aviso. Persiste aunque luego
  // desactive (re-activar no requiere re-reconocer, D6). null = nunca reconoció.
  // [Cabo legal: la forma client (Date.now) vs server-authoritative del
  // acknowledgedAt es pregunta para el abogado, junto a D3/D4.]
  acknowledgedAt: number | null;
}

export const DEFAULT_SEMANTIC_CONSENT: SemanticConsent = {
  enabled: false,
  acknowledgedAt: null,
};
