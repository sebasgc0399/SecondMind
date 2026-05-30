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
import { invalidatePreferencesCache } from '@/lib/preferences';
import { invalidateAiKeysCache } from '@/lib/apiKeys';
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
  refreshUser: () => Promise<boolean>;
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
  const refreshUser = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    try {
      await auth.currentUser.reload();
      // reload() actualiza la propiedad `emailVerified` del objeto User, pero
      // NO refresca el ID token: su claim `email_verified` queda stale hasta el
      // refresh natural (~1h) o re-login. Las security rules leen
      // `request.auth.token.email_verified`, así que un usuario recién
      // verificado quedaría con TODA lectura/escritura Firestore denegada
      // (preferences, apiKeys y datos) pese a tener emailVerified=true en el
      // cliente. getIdToken(true) fuerza un token nuevo con el claim
      // actualizado antes de que el redirect monte el árbol autenticado.
      // Gate sobre emailVerified: solo refrescar el token al detectar la
      // verificación, no en cada focus/visibilitychange mientras sigue pendiente.
      if (auth.currentUser.emailVerified) {
        await auth.currentUser.getIdToken(true);
      }
      setUser(auth.currentUser);
      // Retorna el estado verificado para que el caller (p. ej. /verify-email)
      // navegue sobre el valor, decoplado del re-render: setUser recibe el
      // MISMO ref del objeto User (Firebase lo muta in-place), así que React
      // hace bail-out y el useEffect que observa `user.emailVerified` no
      // re-evalúa. El boolean retornado evita depender de ese re-render.
      return auth.currentUser.emailVerified;
    } catch {
      // Network failed o similar: silent. El banner sigue mostrando.
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    invalidateEmbeddingsCache();
    invalidatePreferencesCache();
    invalidateAiKeysCache();
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
