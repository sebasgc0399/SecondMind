import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { readSignupCapacity } from '@/hooks/useSignupCapacity';
import { invalidateEmbeddingsCache } from '@/lib/embeddings';
import { isCapacitor } from '@/lib/capacitor';
import { signInWithCapacitor } from '@/lib/capacitorAuth';
import { isTauri } from '@/lib/tauri';
import { signInWithTauri } from '@/lib/tauriAuth';
import type { User } from 'firebase/auth';

const googleProvider = new GoogleAuthProvider();

interface UseAuthReturn {
  user: User | null;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

export default function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    if (isCapacitor()) {
      await signInWithCapacitor(auth);
    } else if (isTauri()) {
      await signInWithTauri(auth);
    } else {
      await signInWithPopup(auth, googleProvider);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    // Defense in depth (F6): re-check capacity ANTES del create. La UI de
    // SignupCapacityGate ya bloquea pero la ventana entre check inicial y
    // submit del form puede dejar pasar un signup invalido si el counter
    // cambió mid-session. Fail-closed (G8) si doc no existe o lectura falla.
    let capacity;
    try {
      capacity = await readSignupCapacity();
    } catch {
      throw { code: 'capacity-unavailable' };
    }
    if (!capacity) {
      throw { code: 'capacity-unavailable' };
    }
    if (!capacity.canSignUp) {
      throw { code: 'capacity-full' };
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    // Auto-send verification email post-create. Si el envío falla (rate limit,
    // network), no rompemos el flow — el banner F4 ofrecerá reenviar.
    try {
      await sendEmailVerification(credential.user);
    } catch {
      // no-op intencional
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      // user-not-found silenciado: anti-enumeration. El form muestra
      // "Si la cuenta existe, recibirás un enlace" siempre que no haya
      // otros errores (invalid-email, too-many-requests, network-failed).
      const code = (err as { code?: string } | null)?.code;
      if (code === 'auth/user-not-found') return;
      throw err;
    }
  }, []);

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) throw new Error('No user logged in');
    await sendEmailVerification(auth.currentUser);
  }, []);

  // user.reload() refresca el objeto User de Firebase pero NO dispara
  // onAuthStateChanged. Necesitamos setUser(auth.currentUser) explícito
  // para forzar re-render del consumer del hook (G9 plan F47).
  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      await auth.currentUser.reload();
      setUser(auth.currentUser);
    } catch {
      // Network failed o similar: silent. El banner sigue mostrando.
    }
  }, []);

  const signOut = useCallback(async () => {
    invalidateEmbeddingsCache();
    await firebaseSignOut(auth);
  }, []);

  return {
    user,
    isLoading,
    signIn,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    resendVerification,
    refreshUser,
    signOut,
  };
}
