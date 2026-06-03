// IMPORTANTE: usa Firebase SDK directo (getDoc), NO TinyBase — el LoginPage corre SIN user
// autenticado → TinyBase no está inicializado (sus persisters dependen del UID). El cliente
// lee `config/app` directo; `firestore.rules` permite read público de `config/app`.
//
// SPEC-53 Modelo C: el capacity ya NO se mide en el signup (se enforce en la APROBACIÓN, vía
// processAccessRequest). De `config/app` solo queda el kill-switch `signupsEnabled`. Reemplaza
// al viejo useSignupCapacity (que leía el counter de cuentas y maxUsers).

import { useState, useCallback } from 'react';
// eslint-disable-next-line no-restricted-imports -- excepción reconocida (Docs/04 § Excepciones): ruta pre-auth sin TinyBase, ver comentario al tope del archivo
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type SignupsEnabledState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; signupsEnabled: boolean }
  | { status: 'error' };

export async function readSignupsEnabled(): Promise<boolean> {
  const snap = await getDoc(doc(db, 'config', 'app'));
  // Fail-closed (G8): si el doc no existe o el flag no es true, registro cerrado.
  return snap.exists() && snap.data().signupsEnabled === true;
}

export default function useSignupsEnabled() {
  const [state, setState] = useState<SignupsEnabledState>({ status: 'idle' });

  const fetchState = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', signupsEnabled: await readSignupsEnabled() });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  return { state, fetchState };
}
