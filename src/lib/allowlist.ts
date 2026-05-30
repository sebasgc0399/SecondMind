import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface CheckAllowlistRequest {
  email: string;
}

interface CheckAllowlistResponse {
  allowed: boolean;
}

// SPEC-50 F6: wrapper del callable público checkAllowlist (F5). El cliente no
// puede leer allowlist/ directo (F4 deny-all) → este callable es el único canal
// para el pre-check de la beta cerrada. Pasar el email YA normalizado.
const checkAllowlistFn = httpsCallable<CheckAllowlistRequest, CheckAllowlistResponse>(
  functions,
  'checkAllowlist',
);

export async function checkAllowlist(email: string): Promise<boolean> {
  const result = await checkAllowlistFn({ email });
  return result.data.allowed;
}
