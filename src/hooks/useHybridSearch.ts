import { useEffect, useRef, useState } from 'react';
import { notesStore } from '@/stores/notesStore';
import useAuth from '@/hooks/useAuth';
import useNoteSearch from '@/hooks/useNoteSearch';
import useSemanticConsent from '@/hooks/useSemanticConsent';
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
  // SPEC-66 F3/F4: estado del consentimiento para que la UI muestre el banner de
  // activación cuando hay query pero la búsqueda semántica está inerte.
  semanticEnabled: boolean;
  semanticConsentLoaded: boolean;
}

const SEMANTIC_DEBOUNCE_MS = 500;
// Empiricamente calibrado con text-embedding-3-small + notas cortas en espanol.
// Con 0.45 (SPEC original) el top match genuino "Claude Mythos IA" para query
// "inteligencia artificial" quedaba en 0.43. 0.30 captura los matches claros
// (IA/ciberseguridad) y corta antes del ruido (metodologias dispares, templates).
const SEMANTIC_THRESHOLD = 0.3;
const SEMANTIC_MAX_RESULTS = 5;
const MIN_QUERY_LENGTH = 3;

const EMPTY_SEMANTIC_RESULTS: SemanticResult[] = [];

function getNoteDoc(id: string): NoteOramaDoc | null {
  const row = notesStore.getRow('notes', id);
  if (!row || Object.keys(row).length === 0) return null;
  const doc = rowToOramaDoc(id, row);
  if (doc.isArchived) return null;
  if (doc.deletedAt > 0) return null;
  return doc;
}

export default function useHybridSearch(): UseHybridSearchReturn {
  const { user } = useAuth();
  const { query, setQuery, results: keywordResults, isInitializing } = useNoteSearch();
  const { consent, isLoaded: consentLoaded } = useSemanticConsent();
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [isLoadingSemantic, setIsLoadingSemantic] = useState(false);

  const timerRef = useRef<number | null>(null);

  const trimmed = query.trim();
  const hasQuery = !!user && trimmed.length >= MIN_QUERY_LENGTH;
  // SPEC-66 F3: la búsqueda semántica corre SOLO con consentimiento confirmado.
  // Sin él (o mientras carga) degrada a keyword (Orama, independiente) — no se
  // llama a embedQuery en vano. El server igual es la defensa autoritativa: si
  // el cliente fallara, embedQuery rechaza con 'semantic-search-disabled'.
  const semanticActive = hasQuery && consentLoaded && consent.enabled;

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!semanticActive || !user) return;

    const userId = user.uid;
    const frozenQuery = trimmed;
    const keywordIds = new Set(keywordResults.map((note) => note.id));

    timerRef.current = window.setTimeout(() => {
      setIsLoadingSemantic(true);
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
  }, [trimmed, semanticActive, user, keywordResults, query]);

  return {
    query,
    setQuery,
    keywordResults,
    semanticResults: semanticActive ? semanticResults : EMPTY_SEMANTIC_RESULTS,
    isInitializing,
    isLoadingSemantic: semanticActive ? isLoadingSemantic : false,
    semanticEnabled: consent.enabled,
    semanticConsentLoaded: consentLoaded,
  };
}
