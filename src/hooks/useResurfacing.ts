import { useCallback } from 'react';
import { useRow } from 'tinybase/ui-react';
import { notesStore } from '@/stores/notesStore';
import {
  createEmptyCard,
  Rating,
  scheduleReview,
  serializeCard,
  deserializeCard,
} from '@/lib/fsrs';
import type { Grade } from 'ts-fsrs';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

interface UseResurfacingReturn {
  isDue: boolean;
  hasReviewState: boolean;
  nextReviewDate: Date | null;
  reviewNote: (rating: Grade) => void;
  activateReview: () => void;
}

export default function useResurfacing(noteId: string): UseResurfacingReturn {
  const row = useRow('notes', noteId);

  const fsrsState = typeof row.fsrsState === 'string' ? row.fsrsState : '';
  const fsrsDue = typeof row.fsrsDue === 'number' ? row.fsrsDue : 0;

  const hasReviewState = fsrsState !== '' && fsrsDue > 0;
  // eslint-disable-next-line react-hooks/purity -- render se invalida por cambios de fsrsDue/fsrsState; drift sub-segundo es invisible
  const now = Date.now();
  const isDue = hasReviewState && fsrsDue <= now + TWENTY_FOUR_HOURS;
  const nextReviewDate = hasReviewState ? new Date(fsrsDue) : null;

  const reviewNote = useCallback(
    (rating: Grade) => {
      const card = fsrsState ? deserializeCard(fsrsState) : createEmptyCard();
      const { card: newCard, dueTimestamp } = scheduleReview(card, rating);

      notesStore.setPartialRow('notes', noteId, {
        fsrsState: serializeCard(newCard),
        fsrsDue: dueTimestamp,
        fsrsLastReview: Date.now(),
      });
    },
    [noteId, fsrsState],
  );

  const activateReview = useCallback(() => {
    const card = createEmptyCard();
    const { card: newCard, dueTimestamp } = scheduleReview(card, Rating.Good);

    notesStore.setPartialRow('notes', noteId, {
      fsrsState: serializeCard(newCard),
      fsrsDue: dueTimestamp,
      fsrsLastReview: Date.now(),
    });
  }, [noteId]);

  return { isDue, hasReviewState, nextReviewDate, reviewNote, activateReview };
}

export { Rating };
