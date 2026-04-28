// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';
import {
  allQueues,
  saveContentQueue,
  saveNotesCreatesQueue,
  saveNotesMetaQueue,
  saveTasksQueue,
} from '@/lib/saveQueue';
import usePendingSyncCount from './usePendingSyncCount';

const PENDING_FOREVER = (): Promise<void> => new Promise<void>(() => {});
const PERMANENT_ERROR = (): Promise<void> =>
  Promise.reject(new FirebaseError('permission-denied', 'test'));

describe('usePendingSyncCount — de-dupe per entityId intra-queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    allQueues.forEach((q) => q.clear());
  });

  afterEach(() => {
    allQueues.forEach((q) => q.clear());
    vi.useRealTimers();
  });

  it('queues vacías → hasAny false, byEntity []', () => {
    const { result } = renderHook(() => usePendingSyncCount());
    expect(result.current.hasAny).toBe(false);
    expect(result.current.total).toBe(0);
    expect(result.current.errorCount).toBe(0);
    expect(result.current.byEntity).toEqual([]);
  });

  it('1 nota con updateMeta + accept + dismiss simultáneos → 1 entidad, no 3', () => {
    const { result } = renderHook(() => usePendingSyncCount());
    act(() => {
      saveNotesMetaQueue.enqueue('note-A', { title: 'x' }, PENDING_FOREVER);
      saveNotesMetaQueue.enqueue('note-A:accept-sug-1', {} as never, PENDING_FOREVER);
      saveNotesMetaQueue.enqueue('note-A:dismiss-sug-2', {} as never, PENDING_FOREVER);
    });
    expect(result.current.total).toBe(1);
    expect(result.current.byEntity).toHaveLength(1);
    expect(result.current.byEntity[0]).toMatchObject({
      entity: 'nota',
      count: 1,
      hasError: false,
    });
  });

  it('2 notas distintas en saveNotesMetaQueue → count=2, label plural', () => {
    const { result } = renderHook(() => usePendingSyncCount());
    act(() => {
      saveNotesMetaQueue.enqueue('note-A', { title: 'x' }, PENDING_FOREVER);
      saveNotesMetaQueue.enqueue('note-B', { title: 'y' }, PENDING_FOREVER);
    });
    expect(result.current.total).toBe(2);
    expect(result.current.byEntity).toHaveLength(1);
    expect(result.current.byEntity[0]).toMatchObject({
      entity: 'notas',
      count: 2,
    });
  });

  it('cross-queue: misma noteId en createsQueue + metaQueue → 2 filas, total=2 (sin collapse cross-queue, Opción C)', () => {
    const { result } = renderHook(() => usePendingSyncCount());
    act(() => {
      saveNotesCreatesQueue.enqueue('note-A', {} as never, PENDING_FOREVER);
      saveNotesMetaQueue.enqueue('note-A', { title: 'x' }, PENDING_FOREVER);
    });
    expect(result.current.total).toBe(2);
    expect(result.current.byEntity).toHaveLength(2);
    const labels = result.current.byEntity.map((e) => e.entity);
    expect(labels).toEqual(expect.arrayContaining(['nota', 'nota nueva']));
  });

  it('mixed: 1 task pending + 1 nota con 2 writes en metaQueue → byEntity 2 filas, total=2', () => {
    const { result } = renderHook(() => usePendingSyncCount());
    act(() => {
      saveTasksQueue.enqueue('task-A', { title: 't' }, PENDING_FOREVER);
      saveNotesMetaQueue.enqueue('note-A', { title: 'n' }, PENDING_FOREVER);
      saveNotesMetaQueue.enqueue('note-A:accept-sug', {} as never, PENDING_FOREVER);
    });
    expect(result.current.total).toBe(2);
    expect(result.current.byEntity).toHaveLength(2);
    const tasks = result.current.byEntity.find((e) => e.entity === 'tarea');
    const notes = result.current.byEntity.find((e) => e.entity === 'nota');
    expect(tasks?.count).toBe(1);
    expect(notes?.count).toBe(1);
  });

  it('errorCount dedupeado: 1 nota con 2 writes en error → errorCount=1, hasError=true', async () => {
    const { result } = renderHook(() => usePendingSyncCount());
    await act(async () => {
      saveNotesMetaQueue.enqueue('note-A', { title: 'x' }, PERMANENT_ERROR);
      saveNotesMetaQueue.enqueue('note-A:accept-sug-1', {} as never, PERMANENT_ERROR);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.total).toBe(1);
    expect(result.current.errorCount).toBe(1);
    expect(result.current.byEntity).toHaveLength(1);
    expect(result.current.byEntity[0]).toMatchObject({
      entity: 'nota',
      count: 1,
      hasError: true,
    });
  });

  it('errorCount distingue notas distintas: 2 notas con 1 error cada una → errorCount=2', async () => {
    const { result } = renderHook(() => usePendingSyncCount());
    await act(async () => {
      saveNotesMetaQueue.enqueue('note-A', { title: 'x' }, PERMANENT_ERROR);
      saveNotesMetaQueue.enqueue('note-B', { title: 'y' }, PERMANENT_ERROR);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.total).toBe(2);
    expect(result.current.errorCount).toBe(2);
  });

  it('saveContentQueue (key === noteId puro) cuenta como 1 edición de nota', () => {
    const { result } = renderHook(() => usePendingSyncCount());
    act(() => {
      saveContentQueue.enqueue('note-A', {} as never, PENDING_FOREVER);
    });
    expect(result.current.total).toBe(1);
    expect(result.current.byEntity[0]?.entity).toBe('edición de nota');
  });

  it('singular vs plural según count dedupeado, no entries.size (3 entries → "nota" no "notas")', () => {
    const { result } = renderHook(() => usePendingSyncCount());
    act(() => {
      saveNotesMetaQueue.enqueue('note-A', { title: 'x' }, PENDING_FOREVER);
      saveNotesMetaQueue.enqueue('note-A:accept-1', {} as never, PENDING_FOREVER);
      saveNotesMetaQueue.enqueue('note-A:dismiss-2', {} as never, PENDING_FOREVER);
    });
    expect(result.current.byEntity[0]?.entity).toBe('nota');
  });
});
