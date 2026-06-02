import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, adminEmail } from '../lib/requireAdmin';

// DTO de salida (definido local — functions es un proyecto TS independiente del web,
// fuera de su rootDir; el cliente tiene su propio src/types/accessRequest.ts compatible).
interface AccessRequestDTO {
  id: string;
  email: string;
  motivo?: string;
  status: string;
  createdAt: number | null;
  processedAt?: number | null;
}

const MAX_RESULTS = 200;

// SPEC-52 F3 — lista la cola PENDIENTE para /admin. Admin-only (requireAdmin server-side).
// Lee con Admin SDK (bypassa el deny-all de accessRequests/). where(status==pending) usa el
// índice de campo único automático; el orden por createdAt se hace en memoria (sin índice
// compuesto — sano a escala beta). Timestamps → epoch ms (un Firestore Timestamp no es
// JSON-serializable en la respuesta del callable).
export const listAccessRequests = onCall<unknown, Promise<{ requests: AccessRequestDTO[] }>>(
  {
    secrets: [adminEmail],
    timeoutSeconds: 10,
    region: 'us-central1',
    maxInstances: 2,
  },
  async (request) => {
    requireAdmin(request, adminEmail.value());

    const snap = await getFirestore()
      .collection('accessRequests')
      .where('status', '==', 'pending')
      .limit(MAX_RESULTS)
      .get();

    const toMs = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

    const requests: AccessRequestDTO[] = snap.docs.map((d) => {
      const data = d.data();
      const motivo = typeof data.motivo === 'string' ? data.motivo : undefined;
      return {
        id: d.id,
        email: typeof data.email === 'string' ? data.email : d.id,
        ...(motivo ? { motivo } : {}),
        status: typeof data.status === 'string' ? data.status : 'pending',
        createdAt: toMs(data.createdAt),
        processedAt: toMs(data.processedAt),
      };
    });

    requests.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return { requests };
  },
);
