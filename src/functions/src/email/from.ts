// SPEC-65 F1.2 — remitente de los emails transaccionales (Resend). D1: dominio apex
// getsecondmind.co verificado en Resend; DKIM/SPF firman noreply@getsecondmind.co.
export const EMAIL_FROM = {
  name: 'SecondMind',
  address: 'noreply@getsecondmind.co',
} as const;

// Header From en formato RFC 5322: "SecondMind <noreply@getsecondmind.co>".
export function getFromHeader(): string {
  return `${EMAIL_FROM.name} <${EMAIL_FROM.address}>`;
}
