// IMPORTANTE: este hook usa Firebase SDK directo (getDoc), NO TinyBase.
// Razón: el LoginPage corre SIN user autenticado → TinyBase no está
// inicializado (sus persisters dependen del UID, ver `useStoreInit`).
// Cliente lee `config/app` directo de Firestore — `firestore.rules`
// permite read público de `config/{configId}` (F6 SPEC).
// Trade-off documentado: cero acoplamiento con TinyBase ↔ bypass del
// patrón global del proyecto, pero justificado por el contexto unauth.

import { useState, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface SignupCapacity {
  userCount: number;
  maxUsers: number;
  signupsEnabled: boolean;
  canSignUp: boolean;
}

export type SignupCapacityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; capacity: SignupCapacity }
  | { status: 'error'; message: string };

const CACHE_KEY = 'secondmind:signup-capacity-cache';
const CACHE_TTL_MS = 60_000;

interface CachedCapacity {
  capacity: SignupCapacity;
  fetchedAt: number;
}

function readCache(): SignupCapacity | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCapacity;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.capacity;
  } catch {
    return null;
  }
}

function writeCache(capacity: SignupCapacity) {
  try {
    const payload: CachedCapacity = { capacity, fetchedAt: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage no disponible (modo privado strict, etc.) — no-op
  }
}

export async function readSignupCapacity(): Promise<SignupCapacity | null> {
  const snap = await getDoc(doc(db, 'config', 'app'));
  if (!snap.exists()) return null;
  const data = snap.data() as {
    maxUsers?: number;
    signupsEnabled?: boolean;
    userCount?: number;
  };
  const userCount = typeof data.userCount === 'number' ? data.userCount : 0;
  const maxUsers = typeof data.maxUsers === 'number' ? data.maxUsers : 0;
  const signupsEnabled = data.signupsEnabled === true;
  return {
    userCount,
    maxUsers,
    signupsEnabled,
    canSignUp: signupsEnabled && userCount < maxUsers,
  };
}

export default function useSignupCapacity() {
  const [state, setState] = useState<SignupCapacityState>(() => {
    const cached = readCache();
    return cached ? { status: 'ready', capacity: cached } : { status: 'idle' };
  });

  const fetchCapacity = useCallback(async () => {
    const cached = readCache();
    if (cached) {
      setState({ status: 'ready', capacity: cached });
      return;
    }

    setState({ status: 'loading' });
    try {
      const capacity = await readSignupCapacity();
      if (!capacity) {
        // Fail-closed (G8): si el doc no existe, bloquear signup.
        setState({
          status: 'error',
          message: 'No se pudo verificar disponibilidad. Reintentá.',
        });
        return;
      }
      writeCache(capacity);
      setState({ status: 'ready', capacity });
    } catch {
      setState({
        status: 'error',
        message: 'No se pudo verificar disponibilidad. Reintentá.',
      });
    }
  }, []);

  return { state, fetchCapacity };
}
