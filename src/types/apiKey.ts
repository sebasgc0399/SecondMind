export type ApiKeyProvider = 'anthropic';

// Metadata legible de las API keys del usuario (users/{uid}/settings/aiKeys).
// NO contiene la key — solo si está configurada y los últimos 4 chars para
// mostrar en la UI. El ciphertext vive en userSecrets/ (deny-all).
export interface ApiKeyMeta {
  configured: boolean;
  last4: string | null;
}

export interface AiKeysState {
  anthropic: ApiKeyMeta;
}

export const DEFAULT_AI_KEYS: AiKeysState = {
  anthropic: { configured: false, last4: null },
};
