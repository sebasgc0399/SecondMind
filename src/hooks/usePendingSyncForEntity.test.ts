// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';
import {
  allQueues,
  saveContentQueue,
  saveInboxQueue,
  saveNotesCreatesQueue,
  saveNotesMetaQueue,
  saveTasksQueue,
} from '@/lib/saveQueue';
import usePendingSyncForEntity from './usePendingSyncForEntity';

const PENDING_FOREVER = (): Promise<void> => new Promise<void>(() => {});
const PERMANENT_ERROR = (): Promise<void> =>
  Promise.reject(new FirebaseError('permission-denied', 'test'));

describe('usePendingSyncForEntity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    allQueues.forEach((q) => q.clear());
  });

  afterEach(() => {
    allQueues.forEach((q) => q.clear());
    vi.useRealTimers();
  });

  it('queues vacías → isPending=false, hasError=false', () => {
    const { result } = renderHook(() => usePendingSyncForEntity('note', 'note-A'));
    expect(result.current.isPending).toBe(false);
    expect(result.current.hasError).toBe(false);
  });

  it('nota con write pending en saveContentQueue → isPending=true', () => {
    const { result } = renderHook(() => usePendingSyncForEntity('note', 'note-A'));
    act(() => {
      saveContentQueue.enqueue('note-A', {} as never, PENDING_FOREVER);
    });
    expect(result.current.isPending).toBe(true);
    expect(result.current.hasError).toBe(false);
  });

  it('nota con writes en 3 queues distintas → isPending=true (de-dupe per id)', () => {
    const { result } = renderHook(() => usePendingSyncForEntity('note', 'note-A'));
    act(() => {
      saveContentQueue.enqueue('note-A', {} as never, PENDING_FOREVER);
      saveNotesMetaQueue.enqueue('note-A', { title: 'x' }, PENDING_FOREVER);
      saveNotesCreatesQueue.enqueue('note-A', {} as never, PENDING_FOREVER);
    });
    expect(result.current.isPending).toBe(true);
  });

  it('composite key saveNotesMetaQueue (`${noteId}:accept-${suggestionId}`) matchea por prefijo', () => {
    const { result } = renderHook(() => usePendingSyncForEntity('note', 'note-A'));
    act(() => {
      saveNotesMetaQueue.enqueue('note-A:accept-sug-1', {} as never, PENDING_FOREVER);
    });
    expect(result.current.isPending).toBe(true);
  });

  it('otra nota pending NO marca como pending la nota consultada', () => {
    const { result } = renderHook(() => usePendingSyncForEntity('note', 'note-A'));
    act(() => {
      saveNotesMetaQueue.enqueue('note-B', { title: 'x' }, PENDING_FOREVER);
    });
    expect(result.current.isPending).toBe(false);
  });

  it('error en queue → hasError=true e isPending=true', async () => {
    const { result } = renderHook(() => usePendingSyncForEntity('note', 'note-A'));
    await act(async () => {
      saveNotesMetaQueue.enqueue('note-A', { title: 'x' }, PERMANENT_ERROR);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isPending).toBe(true);
    expect(result.current.hasError).toBe(true);
  });

  it('task con write en saveTasksQueue → isPending=true', () => {
    const { result } = renderHook(() => usePendingSyncForEntity('task', 'task-A'));
    act(() => {
      saveTasksQueue.enqueue('task-A', { title: 't' }, PENDING_FOREVER);
    });
    expect(result.current.isPending).toBe(true);
  });

  it('inboxItem con write en saveInboxQueue → isPending=true', () => {
    const { result } = renderHook(() => usePendingSyncForEntity('inboxItem', 'inbox-A'));
    act(() => {
      saveInboxQueue.enqueue('inbox-A', { rawContent: 'x' }, PENDING_FOREVER);
    });
    expect(result.current.isPending).toBe(true);
  });

  it('cross-entity: write en saveTasksQueue NO marca pending para entityType=note', () => {
    const { result } = renderHook(() => usePendingSyncForEntity('note', 'task-A'));
    act(() => {
      saveTasksQueue.enqueue('task-A', { title: 't' }, PENDING_FOREVER);
    });
    expect(result.current.isPending).toBe(false);
  });

  it('preserva ref del status entre renders cuando no cambió (Object.is sin re-render)', () => {
    const { result, rerender } = renderHook(() => usePendingSyncForEntity('note', 'note-A'));
    const initial = result.current;
    rerender();
    expect(result.current).toBe(initial);

    act(() => {
      // Pending en otra nota — bumpea globalVersion pero no cambia status de note-A.
      saveNotesMetaQueue.enqueue('note-B', { title: 'y' }, PENDING_FOREVER);
    });
    // El status de note-A sigue siendo synced; ref preservada.
    expect(result.current).toBe(initial);
  });
});
