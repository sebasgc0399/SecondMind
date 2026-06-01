// SPEC-51 F3 — gotcha del bounce de navegación (Google y email/pw).
// El gate post-auth de allowlist hace signOut ante no-autorizado → el redirect
// /login → / → /login RE-MONTA LoginCard. Con el error en un useState local de
// LoginCard el mensaje se perdía: la instancia nueva arranca vacía y el setError
// del catch corre sobre una instancia ya desmontada (o antes de que monte la nueva,
// porque el throw del gate ocurre DESPUÉS del re-montaje).
//
// Este store module-level + useSyncExternalStore (ver useLoginError) hace que el
// error SOBREVIVA el re-montaje y sea reactivo: el setter notifica y LoginCard
// re-renderiza aunque se haya montado antes de que el error llegue. NO es gating de
// navegación (opción b descartada): la navegación sigue su curso; solo el mensaje
// persiste. Se limpia en cada nueva acción de login (onError('')), al cambiar de
// vista, y en signOut (evita error stale al volver a /login tras un logout).
let current = '';
const listeners = new Set<() => void>();

export function setLoginError(message: string): void {
  if (message === current) return;
  current = message;
  for (const listener of listeners) listener();
}

export function getLoginError(): string {
  return current;
}

export function subscribeLoginError(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
