import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
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

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  return { user, isLoading, signIn, signOut };
}
