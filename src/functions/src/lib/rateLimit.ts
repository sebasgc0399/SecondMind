import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
// Ventanas de gracia para expireAt: un increment tardío puede caer en un doc que la
// TTL está por purgar. +2 ventanas evita borrar un slot todavía en uso.
const EXPIRE_GRACE_WINDOWS = 2;

export interface RateLimits {
  perMinute: number;
  perDay: number;
}

export interface RateLimitWindow {
  docId: string;
  expireAtMs: number;
  limit: number;
}

// LÓGICA PURA (testeable sin Firestore — ver rateLimit.test.ts): calcula los docs de
// ventana (minuto y día) para un uid+key en un instante dado. El reset del contador lo
// da el doc-id nuevo por slot (Math.floor(now/ventana)), NO la purga TTL (que es
// eventual): un doc viejo sin purgar no afecta el conteo de la ventana actual.
export function computeWindows(
  uid: string,
  key: string,
  limits: RateLimits,
  nowMs: number,
): RateLimitWindow[] {
  const minuteSlot = Math.floor(nowMs / MINUTE_MS);
  const daySlot = Math.floor(nowMs / DAY_MS);
  return [
    {
      docId: `${uid}__${key}__min__${minuteSlot}`,
      expireAtMs: (minuteSlot + EXPIRE_GRACE_WINDOWS) * MINUTE_MS,
      limit: limits.perMinute,
    },
    {
      docId: `${uid}__${key}__day__${daySlot}`,
      expireAtMs: (daySlot + EXPIRE_GRACE_WINDOWS) * DAY_MS,
      limit: limits.perDay,
    },
  ];
}

// LÓGICA PURA: el contador (post-increment) excede el límite. count === limit pasa;
// count === limit + 1 es la primera llamada rechazada.
export function exceedsLimit(count: number, limit: number): boolean {
  return count > limit;
}

// I/O Firestore (verificada E2E, no unit): cap anti-abuso por uid+key. Patrón
// increment-then-read (no transacción, consistente con userCountTriggers.ts): el
// increment es atómico server-side y contar los rechazados es aceptable para un cap
// anti-abuso (no facturación). Colección top-level rateLimits/ deny-all (las rules la
// blindan; el Admin SDK la bypassa). Si CUALQUIER ventana excede → resource-exhausted.
export async function enforceRateLimit(
  uid: string,
  key: string,
  limits: RateLimits,
): Promise<void> {
  const windows = computeWindows(uid, key, limits, Date.now());
  const db = getFirestore();
  for (const window of windows) {
    const ref = db.collection('rateLimits').doc(window.docId);
    await ref.set(
      {
        count: FieldValue.increment(1),
        expireAt: Timestamp.fromMillis(window.expireAtMs),
      },
      { merge: true },
    );
    const snap = await ref.get();
    const count = (snap.data()?.count as number | undefined) ?? 0;
    if (exceedsLimit(count, window.limit)) {
      throw new HttpsError(
        'resource-exhausted',
        'Demasiadas solicitudes. Probá de nuevo más tarde.',
      );
    }
  }
}
