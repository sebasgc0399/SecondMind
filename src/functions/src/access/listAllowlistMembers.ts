import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, adminEmail } from '../lib/requireAdmin';

// DTO de salida (definido local — functions es un proyecto TS independiente del web; el
// cliente tiene su propio src/types/allowlistMember.ts compatible).
interface AllowlistMemberDTO {
  email: string;
  addedAt: number | null;
}

const MAX_RESULTS = 500;

// SPEC-53 F2 — lista los miembros actuales de la beta (allowlist/) para /admin. Admin-only
// (requireAdmin server-side). Lee con Admin SDK (bypassa el deny-all de allowlist/). Los ~100
// emails son PII (A-3): por eso pasa por CF admin-only y NUNCA por read directo del cliente.
// La existencia del doc ES la membresía; addedAt (Timestamp, opcional en docs viejos) → epoch
// ms. Orden por addedAt desc en memoria (sin where → sin índice).
export const listAllowlistMembers = onCall<unknown, Promise<{ members: AllowlistMemberDTO[] }>>(
  {
    secrets: [adminEmail],
    timeoutSeconds: 10,
    region: 'us-central1',
    maxInstances: 2,
  },
  async (request) => {
    requireAdmin(request, adminEmail.value());

    const snap = await getFirestore().collection('allowlist').limit(MAX_RESULTS).get();

    const toMs = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

    const members: AllowlistMemberDTO[] = snap.docs.map((d) => ({
      email: d.id,
      addedAt: toMs(d.data().addedAt),
    }));

    members.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    return { members };
  },
);
