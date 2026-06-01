import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface CheckMyAccessResponse {
  authorized: boolean;
}

// SPEC-51 F2 (A-3): wrapper del callable AUTENTICADO checkMyAccess (reemplaza el
// público checkAllowlist, que era un oráculo de enumeración). NO recibe email: el
// servidor lee el email del propio token de la sesión → solo se puede consultar
// el acceso propio, no enumerar terceros. Devuelve si el usuario autenticado está
// en la allowlist de la beta. PROPAGA cualquier error de la callable (red /
// unavailable): el caller (useAuth) lo distingue de `authorized === false` para
// no echar al usuario ante un fallo transitorio (ver SPEC-51 F3).
const checkMyAccessFn = httpsCallable<unknown, CheckMyAccessResponse>(functions, 'checkMyAccess');

export async function checkMyAccess(): Promise<boolean> {
  const result = await checkMyAccessFn();
  return result.data.authorized;
}
