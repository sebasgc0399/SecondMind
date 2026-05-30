import { onCall } from 'firebase-functions/v2/https';
import { isAllowlisted } from '../lib/assertAllowlisted';

interface CheckAllowlistRequest {
  email: string;
}

interface CheckAllowlistResponse {
  allowed: boolean;
}

// SPEC-50 F5 (A-2): pre-check de allowlist para el cliente. PÚBLICO (sin
// request.auth) porque corre pre-cuenta en el signup email/pw, donde todavía no
// hay sesión. El cliente no puede leer allowlist/ directo (F4 deny-all) → este
// callable es el único canal. Revela membresía → oráculo de enumeración 1-a-1,
// ACEPTADO para la beta (revelar quién está invitado es daño bajo). La
// mitigación real es App Check (fast-follow A-3, fuera de scope); maxInstances
// solo acota costo/concurrencia, NO cierra el oráculo.
export const checkAllowlist = onCall<CheckAllowlistRequest, Promise<CheckAllowlistResponse>>(
  {
    timeoutSeconds: 10,
    region: 'us-central1',
    maxInstances: 5,
  },
  async (request) => {
    return { allowed: await isAllowlisted(request.data?.email) };
  },
);
