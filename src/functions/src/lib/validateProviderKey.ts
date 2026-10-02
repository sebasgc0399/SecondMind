// Valida una API key de un provider con un ping liviano de solo-lectura
// (no consume tokens de inferencia). Usado por saveApiKey (BYOK F48) antes
// de cifrar y persistir. Distingue 'invalid' (rechazar) de 'unknown'
// (transitorio: 429/5xx/network → no guardar una key sin verificar).
export type KeyValidation = 'valid' | 'invalid' | 'unknown';

const TIMEOUT_MS = 5000;

export async function validateProviderKey(provider: string, key: string): Promise<KeyValidation> {
  if (provider === 'anthropic') {
    try {
      // ANTHROPIC_BASE_URL solo existe en el emulador (scripts/emu-secret.mjs, sin egreso); en
      // producción no está definida y se usa la API real.
      const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';
      const res = await fetch(`${baseUrl}/v1/models`, {
        method: 'GET',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 200) return 'valid';
      if (res.status === 401 || res.status === 403) return 'invalid';
      return 'unknown'; // 429, 5xx → transitorio, no se pudo verificar ahora
    } catch {
      return 'unknown'; // network error / abort (timeout)
    }
  }
  return 'unknown'; // provider no soportado en MVP (Gemini/OpenAI → F49+)
}
