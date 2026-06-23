import { useEffect, useState } from 'react';
import i18n from '@/lib/i18n';
import { notesStore } from '@/stores/notesStore';
import useAuth from '@/hooks/useAuth';
import useSemanticConsent from '@/hooks/useSemanticConsent';
import {
  cosineSimilarity,
  fetchEmbedding,
  getEmbeddingsCache,
  updateEmbeddingInCache,
} from '@/lib/embeddings';

export interface SimilarNote {
  noteId: string;
  title: string;
  score: number;
}

interface UseSimilarNotesReturn {
  notes: SimilarNote[];
  isLoading: boolean;
  noEmbedding: boolean;
  // SPEC-66 F3: la búsqueda semántica está desactivada (sin consentimiento). El
  // consumidor muestra el prompt de activación en vez de "sin notas similares".
  disabled: boolean;
}

const SIMILARITY_THRESHOLD = 0.5;
const MAX_RESULTS = 5;

export default function useSimilarNotes(noteId: string): UseSimilarNotesReturn {
  const { user } = useAuth();
  const { consent, isLoaded: consentLoaded } = useSemanticConsent();
  const [notes, setNotes] = useState<SimilarNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [noEmbedding, setNoEmbedding] = useState(false);

  const disabled = consentLoaded && !consent.enabled;

  useEffect(() => {
    if (!user || !noteId) return;

    let cancelled = false;
    const userId = user.uid;

    async function compute() {
      // SPEC-66 F3 — gating de UX (NO es la defensa del invariante; el server es
      // autoritativo). Sin consentimiento, los embeddings están purgados/ausentes:
      // no computamos similares y señalamos `disabled` para el prompt de activación.
      if (consentLoaded && !consent.enabled) {
        setNotes([]);
        setNoEmbedding(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setNoEmbedding(false);

      const currentVector = await fetchEmbedding(userId, noteId);
      if (cancelled) return;

      if (!currentVector) {
        setNoEmbedding(true);
        setNotes([]);
        setIsLoading(false);
        return;
      }

      const cache = await getEmbeddingsCache(userId);
      if (cancelled) return;

      updateEmbeddingInCache(noteId, currentVector);

      const scored: SimilarNote[] = [];
      for (const [otherId, otherVector] of cache) {
        if (otherId === noteId) continue;
        const score = cosineSimilarity(currentVector, otherVector);
        if (score >= SIMILARITY_THRESHOLD) {
          const title =
            (notesStore.getCell('notes', otherId, 'title') as string) ||
            i18n.t('common.untitled', 'Sin título');
          scored.push({ noteId: otherId, title, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      if (!cancelled) {
        setNotes(scored.slice(0, MAX_RESULTS));
        setIsLoading(false);
      }
    }

    void compute();
    return () => {
      cancelled = true;
    };
  }, [noteId, user, consent.enabled, consentLoaded]);

  return { notes, isLoading, noEmbedding, disabled };
}
