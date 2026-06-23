import { useCallback, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import useSemanticConsent from '@/hooks/useSemanticConsent';
import { runBackfillEmbeddings } from '@/lib/embeddings';
import { markSemanticConsentAcknowledged, setSemanticSearchEnabled } from '@/lib/semanticConsent';

interface UseSemanticSearchToggleReturn {
  isLoaded: boolean;
  enabled: boolean;
  acknowledged: boolean;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

// SPEC-66 F4/F5 — orquesta la activación/desactivación de la búsqueda semántica.
// Compartido entre el banner de búsqueda (F4) y la sección de settings (F5).
//
// enable(): si es el PRIMER cruce (sin acknowledgedAt) → markAcknowledged setea
// enabled+acknowledgedAt atómico (el reconocimiento §7.1). Si ya reconoció (D6)
// → solo setEnabled(true), sin re-reconocer. Tras habilitar, corre el backfill
// de las notas existentes (post-consentimiento; idempotente).
//
// disable(): setEnabled(false). El bulk-delete de embeddings lo hace el trigger
// server-side (F7), y el onSnapshot del consent invalida la cache en memoria —
// nada más que hacer acá.
export default function useSemanticSearchToggle(): UseSemanticSearchToggleReturn {
  const { user } = useAuth();
  const { consent, isLoaded } = useSemanticConsent();
  const [busy, setBusy] = useState(false);

  const enable = useCallback(async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (consent.acknowledgedAt == null) {
        await markSemanticConsentAcknowledged(user.uid);
      } else {
        await setSemanticSearchEnabled(user.uid, true);
      }
      await runBackfillEmbeddings();
    } finally {
      setBusy(false);
    }
  }, [user, busy, consent.acknowledgedAt]);

  const disable = useCallback(async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      await setSemanticSearchEnabled(user.uid, false);
    } finally {
      setBusy(false);
    }
  }, [user, busy]);

  return {
    isLoaded,
    enabled: consent.enabled,
    acknowledged: consent.acknowledgedAt != null,
    busy,
    enable,
    disable,
  };
}
