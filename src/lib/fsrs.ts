import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';

const scheduler = fsrs();

export function scheduleReview(card: Card, rating: Grade): { card: Card; dueTimestamp: number } {
  const now = new Date();
  const result = scheduler.next(card, now, rating);
  return {
    card: result.card,
    dueTimestamp: result.card.due.getTime(),
  };
}

export function serializeCard(card: Card): string {
  return JSON.stringify(card);
}

export function deserializeCard(json: string): Card {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  return {
    ...parsed,
    due: new Date(parsed.due as string),
    last_review: parsed.last_review ? new Date(parsed.last_review as string) : undefined,
  } as Card;
}

export { createEmptyCard, Rating };
