// SPEC-50 F6: normalización consistente de email en los puntos cliente
// (pre-check de allowlist + sign in/up). El seed de la allowlist y los guards
// server-side (isAllowlisted/checkAllowlist) aplican el mismo .trim().toLowerCase().
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
