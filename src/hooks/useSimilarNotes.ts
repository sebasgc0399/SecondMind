import { useEffect, useRef, useState } from 'react';
import { notesStore } from '@/stores/notesStore';
import useAuth from '@/hooks/useAuth';
import { cosineSimilarity, fetchEmbedding, fetchAllEmbeddings } from '@/lib/embeddings';

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
  const cacheRef = useRef<Map<string, number[]>>(new Map());

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

      if (cacheRef.current.size === 0) {
        const all = await fetchAllEmbeddings(userId);
        if (cancelled) return;
        cacheRef.current = all;
      }

      cacheRef.current.set(noteId, currentVector);

      const scored: SimilarNote[] = [];
      for (const [otherId, otherVector] of cacheRef.current) {
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
