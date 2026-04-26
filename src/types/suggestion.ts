import type { NoteType } from '@/types/common';

export interface Suggestion {
  id: string;
  label: string;
  description: string;
  action: 'promote-to';
  payload: { noteType: NoteType };
}

// IDs canónicos. Las sugerencias AI usan forma dinámica `promote-to-${noteType}`.
export const SUGGESTION_IDS = {
  promoteToLiteratureAi: 'promote-to-literature',
  promoteToPermanentAi: 'promote-to-permanent',
  promoteToPermanentHeuristic: 'promote-to-permanent-heuristic',
} as const;
