import { useEffect, useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import i18n from '@/lib/i18n';
import { notesStore } from '@/stores/notesStore';
import { isTrashedNote } from '@/lib/noteGuards';
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

// Candidato puntuado sobre el umbral, sin filtrar por estado de la nota: el filtro
// (papelera/archivada/sin row) se aplica al derivar contra la tabla reactiva.
interface ScoredCandidate {
  noteId: string;
  score: number;
}

export default function useSimilarNotes(noteId: string): UseSimilarNotesReturn {
  const { user } = useAuth();
  const { consent, isLoaded: consentLoaded } = useSemanticConsent();
  const notesTable = useTable('notes', notesStore);
  const [candidates, setCandidates] = useState<ScoredCandidate[]>([]);
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
        setCandidates([]);
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
        setCandidates([]);
        setIsLoading(false);
        return;
      }

      const cache = await getEmbeddingsCache(userId);
      if (cancelled) return;

      updateEmbeddingInCache(noteId, currentVector);

      const scored: ScoredCandidate[] = [];
      for (const [otherId, otherVector] of cache) {
        if (otherId === noteId) continue;
        const score = cosineSimilarity(currentVector, otherVector);
        if (score >= SIMILARITY_THRESHOLD) scored.push({ noteId: otherId, score });
      }

      scored.sort((a, b) => b.score - a.score);
      if (!cancelled) {
        setCandidates(scored);
        setIsLoading(false);
      }
    }

    void compute();
    return () => {
      cancelled = true;
    };
  }, [noteId, user, consent.enabled, consentLoaded]);

  // Mismo criterio que useHybridSearch: el soft-delete no borra el embedding, así
  // que se filtran papelera, archivadas y notas que ya no existen. Deriva de la
  // tabla reactiva: si una similar va a la papelera (o se restaura) por sync, la
  // lista se actualiza. El top-N se corta después de filtrar.
  const notes = useMemo<SimilarNote[]>(() => {
    const out: SimilarNote[] = [];
    for (const { noteId: otherId, score } of candidates) {
      const row = notesTable[otherId];
      if (!row || row.isArchived || isTrashedNote(row)) continue;
      const title = (row.title as string) || i18n.t('common.untitled', 'Sin título');
      out.push({ noteId: otherId, title, score });
      if (out.length === MAX_RESULTS) break;
    }
    return out;
  }, [candidates, notesTable]);

  return { notes, isLoading, noEmbedding, disabled };
}
