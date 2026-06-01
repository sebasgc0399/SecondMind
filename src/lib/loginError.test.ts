import { afterEach, describe, expect, it } from 'vitest';
import { getLoginError, setLoginError, subscribeLoginError } from './loginError';

// SPEC-51 F3 — verifica el MECANISMO del fix del bounce (gotcha #1): el error de
// login debe sobrevivir el re-montaje de LoginCard. No reemplaza la verificación
// E2E del flujo OAuth completo, pero prueba la propiedad exacta que el useState
// local rompía (la instancia nueva arrancaba vacía).
describe('loginError store (SPEC-51 F3 — persistencia al re-montaje)', () => {
  afterEach(() => setLoginError(''));

  it('persiste el error a través del desmontaje/re-montaje de LoginCard', () => {
    // Instancia A de LoginCard suscrita (montada).
    let aNotifications = 0;
    const unsubscribeA = subscribeLoginError(() => {
      aNotifications += 1;
    });

    // El gate post-auth setea el error mientras A está montada.
    setLoginError('Tu cuenta todavía no tiene acceso a la beta.');
    expect(aNotifications).toBe(1);

    // Bounce: A se desmonta (cleanup de useSyncExternalStore).
    unsubscribeA();

    // La instancia B (nueva LoginCard tras /login→/→/login) lee el snapshot al
    // montar: el error SOBREVIVIÓ el re-montaje. Esto es lo que el useState local rompía.
    expect(getLoginError()).toBe('Tu cuenta todavía no tiene acceso a la beta.');
  });

  it('notifica a los suscriptores en cada cambio y deduplica el mismo valor', () => {
    let notifications = 0;
    const unsubscribe = subscribeLoginError(() => {
      notifications += 1;
    });
    setLoginError('error 1');
    setLoginError('error 2');
    expect(notifications).toBe(2);
    // Setear el mismo valor no re-notifica (evita renders redundantes en LoginCard).
    setLoginError('error 2');
    expect(notifications).toBe(2);
    unsubscribe();
  });

  it('soporta el ciclo set → clear → set → read (nueva acción / signOut / reintento)', () => {
    setLoginError('primer error');
    expect(getLoginError()).toBe('primer error');
    // Limpieza (signOut o nueva acción de login): vuelve a vacío.
    setLoginError('');
    expect(getLoginError()).toBe('');
    // Reintento que vuelve a fallar: el store acepta el nuevo valor.
    setLoginError('segundo error');
    expect(getLoginError()).toBe('segundo error');
  });
});
