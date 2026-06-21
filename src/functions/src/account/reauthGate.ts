// SPEC-64 F1 (D3) — lógica PURA del gate de reauth, separada del I/O para unit
// testing (mismo patrón que lib/rateLimit.ts: computeWindows/exceedsLimit puras,
// enforceRateLimit hace el I/O). El callable deleteAccount verifica que el reauth
// sea reciente leyendo `auth_time` del token; acá vive la comparación.

export const REAUTH_MAX_AGE_S = 300; // 5 min (D3)

// true = el reauth expiró → rechazar con reauth-required. Fail-closed: un
// `auth_time` ausente o no finito se trata como expirado (nunca permite el
// borrado sin un auth_time válido y reciente).
export function isReauthExpired(
  authTimeSeconds: number,
  nowMs: number,
  maxAgeSeconds: number = REAUTH_MAX_AGE_S,
): boolean {
  if (!Number.isFinite(authTimeSeconds)) return true;
  return nowMs / 1000 - authTimeSeconds > maxAgeSeconds;
}
