import { useEffect } from 'react';
import { hideSplash } from '@/lib/splash';
import type { User } from 'firebase/auth';

interface Args {
  isLoading: boolean;
  user: User | null;
  isHydrating: boolean;
}

// useStoreInit(null) deja isHydrating en true permanente, por eso el OR
// con !user es necesario: cubre el caso de usuario no logueado (va a /login,
// el primer pixel no depende de hidratación de stores).
export default function useHideSplashWhenReady({ isLoading, user, isHydrating }: Args): void {
  useEffect(() => {
    if (!isLoading && (!user || !isHydrating)) {
      void hideSplash();
    }
  }, [isLoading, user, isHydrating]);
}
