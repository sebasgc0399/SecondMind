import { useEffect, useRef, useState } from 'react';
import { notesStore } from '@/stores/notesStore';
import useAuth from '@/hooks/useAuth';
import useNoteSearch from '@/hooks/useNoteSearch';
import { cosineSimilarity, embedQueryText, getEmbeddingsCache } from '@/lib/embeddings';
import { rowToOramaDoc, type NoteOramaDoc } from '@/lib/orama';

export interface SemanticResult {
  note: NoteOramaDoc;
  score: number;
}

interface UseHybridSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  keywordResults: NoteOramaDoc[];
  semanticResults: SemanticResult[];
  isInitializing: boolean;
  isLoadingSemantic: boolean;
}

const SEMANTIC_DEBOUNCE_MS = 500;
const SEMANTIC_THRESHOLD = 0.45;
const SEMANTIC_MAX_RESULTS = 5;
const MIN_QUERY_LENGTH = 3;

function getNoteDoc(id: string): NoteOramaDoc | null {
  const row = notesStore.getRow('notes', id);
  if (!row || Object.keys(row).length === 0) return null;
  const doc = rowToOramaDoc(id, row);
  if (doc.isArchived) return null;
  return doc;
}

export default function useHybridSearch(): UseHybridSearchReturn {
  const { user } = useAuth();
  const { query, setQuery, results: keywordResults, isInitializing } = useNoteSearch();
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [isLoadingSemantic, setIsLoadingSemantic] = useState(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const trimmed = query.trim();

    if (!user || trimmed.length < MIN_QUERY_LENGTH) {
      setSemanticResults([]);
      setIsLoadingSemantic(false);
      return;
    }

    const userId = user.uid;
    const frozenQuery = trimmed;
    const keywordIds = new Set(keywordResults.map((note) => note.id));

    setIsLoadingSemantic(true);

    timerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const [queryVector, cache] = await Promise.all([
            embedQueryText(frozenQuery),
            getEmbeddingsCache(userId),
          ]);

          if (frozenQuery !== query.trim()) return;

          const scored: SemanticResult[] = [];
          for (const [noteId, noteVector] of cache) {
            if (keywordIds.has(noteId)) continue;
            const score = cosineSimilarity(queryVector, noteVector);
            if (score < SEMANTIC_THRESHOLD) continue;
            const note = getNoteDoc(noteId);
            if (!note) continue;
            scored.push({ note, score });
          }

          scored.sort((a, b) => b.score - a.score);

          if (frozenQuery !== query.trim()) return;

          setSemanticResults(scored.slice(0, SEMANTIC_MAX_RESULTS));
          setIsLoadingSemantic(false);
        } catch {
          if (frozenQuery !== query.trim()) return;
          setSemanticResults([]);
          setIsLoadingSemantic(false);
        }
      })();
    }, SEMANTIC_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [query, keywordResults, user]);

  return {
    query,
    setQuery,
    keywordResults,
    semanticResults,
    isInitializing,
    isLoadingSemantic,
  };
}
