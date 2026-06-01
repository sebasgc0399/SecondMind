import { useSyncExternalStore } from 'react';
import { getLoginError, setLoginError, subscribeLoginError } from '@/lib/loginError';

// SPEC-51 F3: error de login persistente al re-montaje (ver src/lib/loginError.ts).
// Devuelve [error, setError] con la MISMA firma que el useState que reemplaza en
// LoginCard, así los forms hijos siguen recibiendo onError={setError} sin cambios.
export default function useLoginError(): [string, (message: string) => void] {
  const error = useSyncExternalStore(subscribeLoginError, getLoginError);
  return [error, setLoginError];
}
