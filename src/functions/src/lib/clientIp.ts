import { type CallableRequest } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';

// SPEC-65 F2.3 — extraído de submitAccessRequest (DRY). Hash estable de la IP del cliente para
// el rate-limit PRE-AUTH (callables públicas, sin uid). En Cloud Run rawRequest.ip suele ser el
// LB → preferimos el primer hop de x-forwarded-for. Sin nada → 'unknown' agrupa a los sin-IP en
// un bucket (fail-safe hacia MÁS limitación).
export function clientIpHash(request: CallableRequest): string {
  const xff = request.rawRequest.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  const ip = first || request.rawRequest.ip || 'unknown';
  return createHash('sha256').update(ip).digest('hex');
}
