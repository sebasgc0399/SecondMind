import { useEffect, useRef, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import { invalidateEmbeddingsCache } from '@/lib/embeddings';
import { subscribeSemanticConsent } from '@/lib/semanticConsent';
import { DEFAULT_SEMANTIC_CONSENT, type SemanticConsent } from '@/types/semanticConsent';

interface UseSemanticConsentReturn {
  consent: SemanticConsent;
  isLoaded: boolean;
}

// SPEC-66 F3 — wrapper React sobre subscribeSemanticConsent (cache + dedup en
// src/lib/semanticConsent.ts). Mismo patrón anti-stale (userIdRef) que
// usePreferences. `isLoaded` distingue "default pre-snapshot" del valor real:
// el banner de activación (F4) y el gating de búsqueda esperan isLoaded para no
// parpadear contra defaults.
//
// IMPORTANTE: NO es la defensa del invariante (eso es server-side). Es UX +
// gating local. ÚNICO efecto con peso: al detectar enabled true→false, invalida
// la cache de embeddings en memoria — el bulk-delete server-side (F7) borra los
// docs, pero la cache del cliente debe descartar los vectores ya cargados. Como
// el onSnapshot propaga cross-device, apague el device que apague, cada cliente
// invalida su propia cache.
export default function useSemanticConsent(): UseSemanticConsentReturn {
  const { user } = useAuth();
  const [consent, setConsent] = useState<SemanticConsent>(DEFAULT_SEMANTIC_CONSENT);
  const [isLoaded, setIsLoaded] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const prevEnabledRef = useRef<boolean | null>(null);

  useEffect(() => {
    userIdRef.current = user?.uid ?? null;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset a inerte al sign-out antes del cleanup del onSnapshot
      setConsent(DEFAULT_SEMANTIC_CONSENT);
      setIsLoaded(false);
      prevEnabledRef.current = null;
      return;
    }
    const uid = user.uid;
    setIsLoaded(false);

    const unsubscribe = subscribeSemanticConsent(uid, (c, loaded) => {
      if (userIdRef.current !== uid) return;
      if (loaded && prevEnabledRef.current === true && c.enabled === false) {
        invalidateEmbeddingsCache();
      }
      prevEnabledRef.current = c.enabled;
      setConsent(c);
      setIsLoaded(loaded);
    });
    return unsubscribe;
  }, [user]);

  return { consent, isLoaded };
}
