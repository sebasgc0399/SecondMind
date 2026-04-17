import { useEffect, useState } from 'react';
import { notesStore } from '@/stores/notesStore';
import useAuth from '@/hooks/useAuth';
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
}

const SIMILARITY_THRESHOLD = 0.5;
const MAX_RESULTS = 5;

export default function useSimilarNotes(noteId: string): UseSimilarNotesReturn {
  const { user } = useAuth();
  const [notes, setNotes] = useState<SimilarNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [noEmbedding, setNoEmbedding] = useState(false);

  useEffect(() => {
    if (!user || !noteId) return;

    let cancelled = false;
    const userId = user.uid;

    async function compute() {
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
          const title = (notesStore.getCell('notes', otherId, 'title') as string) || 'Sin titulo';
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
  }, [noteId, user]);

  return { notes, isLoading, noEmbedding };
}
