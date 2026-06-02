import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { enforceRateLimit } from '../lib/rateLimit';
import { sanitizeError } from '../lib/sanitizeError';

// SPEC-52 F2 — formulario PÚBLICO de solicitud de acceso. Tres invariantes de seguridad:
//  (1) NO-ORÁCULO: respuesta uniforme { ok: true } SIEMPRE (email nuevo / duplicado /
//      ya-allowlisted). NUNCA lee allowlist/ ni cambia el mensaje según membresía — si
//      lo hiciera sería un oráculo de enumeración, justo lo que A-3 (SPEC-51) cerró.
//  (2) Dedup leyendo accessRequests/ (NO allowlist/): doc id = email normalizado.
//  (3) Anti-spam PRE-AUTH por IP (no hay uid): rate-limit con hash de IP como clave,
//      reusando enforceRateLimit (cuyo primer arg es un string arbitrario, no acoplado a uid).

const MAX_EMAIL_LENGTH = 254;
const MAX_MOTIVO_LENGTH = 280;
// Tunables (D2). Frenan el spam de fuente única, el realista para una beta de ~100.
const RATE_LIMITS = { perMinute: 3, perDay: 10 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SubmitAccessRequestData {
  email?: unknown;
  motivo?: unknown;
}

interface SubmitAccessRequestResponse {
  ok: true;
}

// LÓGICA PURA (testeable sin Firestore — ver submitAccessRequest.test.ts).
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email);
}

// Valida + normaliza el input. Devuelve { email, motivo? } o lanza invalid-argument.
// Los errores son sobre FORMATO, nunca sobre membresía → no filtran nada.
export function validateInput(data: SubmitAccessRequestData): { email: string; motivo?: string } {
  const rawEmail = data?.email;
  if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
    throw new HttpsError('invalid-argument', 'El email es requerido');
  }
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new HttpsError('invalid-argument', 'El email no es válido');
  }
  const rawMotivo = data?.motivo;
  if (rawMotivo !== undefined && rawMotivo !== null) {
    if (typeof rawMotivo !== 'string') {
      throw new HttpsError('invalid-argument', 'El motivo debe ser texto');
    }
    if (rawMotivo.length > MAX_MOTIVO_LENGTH) {
      throw new HttpsError('invalid-argument', `El motivo excede ${MAX_MOTIVO_LENGTH} caracteres`);
    }
  }
  const motivo = typeof rawMotivo === 'string' ? rawMotivo.trim() : '';
  return motivo ? { email, motivo } : { email };
}

// Hash estable de la IP del cliente para el rate-limit. En Cloud Run el rawRequest.ip
// suele ser el LB → preferimos el primer hop de x-forwarded-for. Si no hay nada,
// 'unknown' agrupa a los sin-IP en un bucket (fail-safe hacia MÁS limitación).
function clientIpHash(request: CallableRequest): string {
  const xff = request.rawRequest.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  const ip = first || request.rawRequest.ip || 'unknown';
  return createHash('sha256').update(ip).digest('hex');
}

export const submitAccessRequest = onCall<
  SubmitAccessRequestData,
  Promise<SubmitAccessRequestResponse>
>(
  {
    timeoutSeconds: 10,
    region: 'us-central1',
    // Callable PÚBLICA (sin request.auth). maxInstances acota costo ante abuso;
    // el rate-limit por IP acota el total por origen.
    maxInstances: 5,
  },
  async (request) => {
    // 1) Validar input ANTES del rate-limit: los malformados no consumen cuota
    //    (mismo criterio que embedQuery). Lanza invalid-argument sobre formato.
    const { email, motivo } = validateInput(request.data ?? {});

    // 2) Anti-spam por IP. Excedido → resource-exhausted (uniforme, no revela nada).
    await enforceRateLimit(clientIpHash(request), 'access-request', RATE_LIMITS);

    // 3) Dedup en transacción leyendo accessRequests/ (NUNCA allowlist/). Si ya existe
    //    un doc para ese email → no-op (no pisa status ni createdAt). Re-solicitar tras
    //    un rejected requiere que el operador borre el doc a mano (raro, aceptado).
    try {
      const db = getFirestore();
      const ref = db.collection('accessRequests').doc(email);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return; // no-op uniforme — NO se lee allowlist/, NO se distingue
        tx.set(ref, {
          email,
          ...(motivo ? { motivo } : {}),
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    } catch (error) {
      // Sin el email crudo en el log (PII). sanitizeError trunca + extrae code.
      const { code, message } = sanitizeError(error);
      logger.error('submitAccessRequest: failed', { code, message });
      throw new HttpsError('internal', 'No se pudo registrar la solicitud');
    }

    // 4) Respuesta UNIFORME — idéntica para nuevo / duplicado / ya-allowlisted.
    return { ok: true };
  },
);
