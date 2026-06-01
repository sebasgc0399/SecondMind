// SPEC-50 F6 / SPEC-51 F3: normalización consistente de email en los puntos
// cliente (sign in/up). El seed de la allowlist y los guards server-side
// (isAllowlisted, vía checkMyAccess/assertAllowlisted) aplican .trim().toLowerCase().
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
