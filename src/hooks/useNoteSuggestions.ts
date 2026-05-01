import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCell } from 'tinybase/ui-react';
import { parseIds } from '@/lib/tinybase';
import { notesRepo } from '@/infra/repos/notesRepo';
import type { NoteType } from '@/types/common';
import type { Suggestion } from '@/types/suggestion';
import { SUGGESTION_IDS } from '@/types/suggestion';

// Filtro client-side para sugerencias AI dudosas (gotcha: minimum/maximum
// del JSON Schema son hints en Anthropic tool use, no enforcement estricto).
const NOTE_TYPE_CONFIDENCE_THRESHOLD = 0.7;

// Heurística B: estricto > 3 (4+ wikilinks salientes).
const HEURISTIC_LINK_THRESHOLD = 3;

const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  fleeting: 'Fleeting',
  literature: 'Literature',
  permanent: 'Permanent',
};

interface RemoteFields {
  suggestedNoteType?: NoteType;
  noteTypeConfidence?: number;
  dismissedSuggestions: string[];
}

export interface UseNoteSuggestionsResult {
  suggestions: Suggestion[];
  accept: (suggestion: Suggestion) => void;
  dismiss: (suggestion: Suggestion) => void;
}

/**
 * Combina dos fuentes reactivas: TinyBase (vía useCell) para campos del
 * schema y `notesRepo.subscribeSuggestions` para los 3 campos que viven
 * SOLO en Firestore (suggestedNoteType, noteTypeConfidence,
 * dismissedSuggestions). El doc-level snapshot dentro del repo (no
 * proyectable en Firestore) puede causar re-renders por cambios en otros
 * campos no-suggestion; aceptable hasta que la fricción se materialice.
 *
 * `localDismissed: Set` es la única fuente de verdad del optimistic state —
 * el componente que consume este hook no debe mantener un Set propio.
 * Se reset en remount key={noteId} del NoteEditor (aceptable: para
 * entonces la suscripción ya propagó el dismiss confirmado).
 */
export function useNoteSuggestions(noteId: string): UseNoteSuggestionsResult {
  const noteType = useCell('notes', noteId, 'noteType') as NoteType | undefined;
  const summaryL3 = (useCell('notes', noteId, 'summaryL3') as string | undefined) ?? '';
  const outgoingLinkIdsRaw =
    (useCell('notes', noteId, 'outgoingLinkIds') as string | undefined) ?? '[]';
  const outgoingLinkIds = useMemo(() => parseIds(outgoingLinkIdsRaw), [outgoingLinkIdsRaw]);

  const [remote, setRemote] = useState<RemoteFields>({ dismissedSuggestions: [] });

  useEffect(() => {
    if (!noteId) return;
    return notesRepo.subscribeSuggestions(noteId, setRemote);
  }, [noteId]);

  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());

  const allDismissed = useMemo(
    () => new Set([...remote.dismissedSuggestions, ...localDismissed]),
    [remote.dismissedSuggestions, localDismissed],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    const result: Suggestion[] = [];

    // A. Sugerencia AI persistida (server-side, vía CF autoTagNote).
    if (
      remote.suggestedNoteType &&
      remote.suggestedNoteType !== noteType &&
      (remote.noteTypeConfidence ?? 0) >= NOTE_TYPE_CONFIDENCE_THRESHOLD
    ) {
      const id = `promote-to-${remote.suggestedNoteType}`;
      if (!allDismissed.has(id)) {
        result.push({
          id,
          label: `Promover a ${NOTE_TYPE_LABEL[remote.suggestedNoteType]}`,
          description: `La AI detectó que esta nota encaja mejor como ${NOTE_TYPE_LABEL[remote.suggestedNoteType].toLowerCase()}.`,
          action: 'promote-to',
          payload: { noteType: remote.suggestedNoteType },
        });
      }
    }

    // B. Heurística client-side: dedup vs A si ambas apuntan a permanent.
    const heuristicId = SUGGESTION_IDS.promoteToPermanentHeuristic;
    const heuristicCondition =
      outgoingLinkIds.length > HEURISTIC_LINK_THRESHOLD &&
      summaryL3.trim() !== '' &&
      noteType !== 'permanent';
    if (
      heuristicCondition &&
      !allDismissed.has(heuristicId) &&
      !result.some((s) => s.payload.noteType === 'permanent')
    ) {
      result.push({
        id: heuristicId,
        label: `Promover a ${NOTE_TYPE_LABEL.permanent}`,
        description:
          'Esta nota tiene varias conexiones y un resumen ejecutivo — parece una idea madura.',
        action: 'promote-to',
        payload: { noteType: 'permanent' },
      });
    }

    return result;
  }, [
    noteType,
    remote.suggestedNoteType,
    remote.noteTypeConfidence,
    allDismissed,
    outgoingLinkIds,
    summaryL3,
  ]);

  const dismiss = useCallback(
    (suggestion: Suggestion) => {
      setLocalDismissed((prev) => new Set([...prev, suggestion.id]));
      void notesRepo.dismissSuggestion(noteId, suggestion.id);
    },
    [noteId],
  );

  const accept = useCallback(
    (suggestion: Suggestion) => {
      setLocalDismissed((prev) => new Set([...prev, suggestion.id]));
      void notesRepo.acceptSuggestion(noteId, suggestion.id, suggestion.payload);
    },
    [noteId],
  );

  return { suggestions, accept, dismiss };
}
