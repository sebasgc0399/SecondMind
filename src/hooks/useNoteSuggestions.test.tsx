// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'tinybase/ui-react';
import type { ReactNode } from 'react';

vi.mock('@/stores/notesStore', async () => {
  const { createStore } = await import('tinybase');
  const store = createStore().setTablesSchema({
    notes: {
      noteType: { type: 'string', default: 'fleeting' },
      summaryL3: { type: 'string', default: '' },
      outgoingLinkIds: { type: 'string', default: '[]' },
    },
  });
  return { notesStore: store };
});

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } as { uid: string } | null },
  db: {} as object,
}));

let onSnapshotEmit: (data: Record<string, unknown> | undefined) => void = () => {};

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(
    (_ref, cb: (snap: { data: () => Record<string, unknown> | undefined }) => void) => {
      onSnapshotEmit = (data) => cb({ data: () => data });
      return () => {
        onSnapshotEmit = () => {};
      };
    },
  ),
}));

const acceptMock = vi.fn();
const dismissMock = vi.fn();

vi.mock('@/infra/repos/notesRepo', () => ({
  notesRepo: {
    acceptSuggestion: (...args: unknown[]) => acceptMock(...args),
    dismissSuggestion: (...args: unknown[]) => dismissMock(...args),
  },
}));

import { notesStore } from '@/stores/notesStore';
import { useNoteSuggestions } from '@/hooks/useNoteSuggestions';

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={notesStore}>{children}</Provider>;
}

function emitRemote(data: Record<string, unknown> | undefined) {
  act(() => {
    onSnapshotEmit(data);
  });
}

describe('useNoteSuggestions', () => {
  beforeEach(() => {
    notesStore.delTable('notes');
    acceptMock.mockReset();
    dismissMock.mockReset();
    onSnapshotEmit = () => {};
  });

  it('vacío: sin AI persistida y sin condiciones heurísticas → []', () => {
    notesStore.setRow('notes', 'n1', {
      noteType: 'fleeting',
      summaryL3: '',
      outgoingLinkIds: '[]',
    });
    const { result } = renderHook(() => useNoteSuggestions('n1'), { wrapper });
    emitRemote({ dismissedSuggestions: [] });
    expect(result.current.suggestions).toEqual([]);
  });

  it('AI con confianza ≥0.7 y tipo distinto → sugerencia activa', () => {
    notesStore.setRow('notes', 'n2', { noteType: 'fleeting' });
    const { result } = renderHook(() => useNoteSuggestions('n2'), { wrapper });
    emitRemote({
      suggestedNoteType: 'permanent',
      noteTypeConfidence: 0.9,
      dismissedSuggestions: [],
    });
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0]).toMatchObject({
      id: 'promote-to-permanent',
      payload: { noteType: 'permanent' },
    });
  });

  it('AI con confianza <0.7 → filtrada', () => {
    notesStore.setRow('notes', 'n3', { noteType: 'fleeting' });
    const { result } = renderHook(() => useNoteSuggestions('n3'), { wrapper });
    emitRemote({
      suggestedNoteType: 'permanent',
      noteTypeConfidence: 0.6,
      dismissedSuggestions: [],
    });
    expect(result.current.suggestions).toEqual([]);
  });

  it('AI con tipo == noteType actual → no sugerencia', () => {
    notesStore.setRow('notes', 'n4', { noteType: 'permanent' });
    const { result } = renderHook(() => useNoteSuggestions('n4'), { wrapper });
    emitRemote({
      suggestedNoteType: 'permanent',
      noteTypeConfidence: 0.95,
      dismissedSuggestions: [],
    });
    expect(result.current.suggestions).toEqual([]);
  });

  it('AI dismissed remoto → filtrada', () => {
    notesStore.setRow('notes', 'n5', { noteType: 'fleeting' });
    const { result } = renderHook(() => useNoteSuggestions('n5'), { wrapper });
    emitRemote({
      suggestedNoteType: 'literature',
      noteTypeConfidence: 0.85,
      dismissedSuggestions: ['promote-to-literature'],
    });
    expect(result.current.suggestions).toEqual([]);
  });

  it('heurística B: outgoingLinks=4 + summaryL3 + fleeting → sugerencia heurística', () => {
    notesStore.setRow('notes', 'n6', {
      noteType: 'fleeting',
      summaryL3: 'Resumen ejecutivo de la idea.',
      outgoingLinkIds: JSON.stringify(['a', 'b', 'c', 'd']),
    });
    const { result } = renderHook(() => useNoteSuggestions('n6'), { wrapper });
    emitRemote({ dismissedSuggestions: [] });
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0]).toMatchObject({
      id: 'promote-to-permanent-heuristic',
      payload: { noteType: 'permanent' },
    });
  });

  it('heurística B: outgoingLinks=3 (límite) → no sugerencia (estricto > 3)', () => {
    notesStore.setRow('notes', 'n7', {
      noteType: 'fleeting',
      summaryL3: 'Resumen.',
      outgoingLinkIds: JSON.stringify(['a', 'b', 'c']),
    });
    const { result } = renderHook(() => useNoteSuggestions('n7'), { wrapper });
    emitRemote({ dismissedSuggestions: [] });
    expect(result.current.suggestions).toEqual([]);
  });

  it('heurística B: noteType=permanent → no sugerencia (ya promovida)', () => {
    notesStore.setRow('notes', 'n8', {
      noteType: 'permanent',
      summaryL3: 'Resumen.',
      outgoingLinkIds: JSON.stringify(['a', 'b', 'c', 'd']),
    });
    const { result } = renderHook(() => useNoteSuggestions('n8'), { wrapper });
    emitRemote({ dismissedSuggestions: [] });
    expect(result.current.suggestions).toEqual([]);
  });

  it('dedup: AI suggiere permanent + heurística también → solo AI', () => {
    notesStore.setRow('notes', 'n9', {
      noteType: 'fleeting',
      summaryL3: 'Resumen.',
      outgoingLinkIds: JSON.stringify(['a', 'b', 'c', 'd']),
    });
    const { result } = renderHook(() => useNoteSuggestions('n9'), { wrapper });
    emitRemote({
      suggestedNoteType: 'permanent',
      noteTypeConfidence: 0.9,
      dismissedSuggestions: [],
    });
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0].id).toBe('promote-to-permanent');
  });

  it('dismiss(): llama notesRepo.dismissSuggestion + filtra optimisticamente', () => {
    notesStore.setRow('notes', 'n10', { noteType: 'fleeting' });
    const { result } = renderHook(() => useNoteSuggestions('n10'), { wrapper });
    emitRemote({
      suggestedNoteType: 'permanent',
      noteTypeConfidence: 0.9,
      dismissedSuggestions: [],
    });
    expect(result.current.suggestions).toHaveLength(1);

    const suggestion = result.current.suggestions[0];
    act(() => {
      result.current.dismiss(suggestion);
    });

    expect(dismissMock).toHaveBeenCalledWith('n10', 'promote-to-permanent');
    expect(result.current.suggestions).toEqual([]);
  });

  it('accept(): llama notesRepo.acceptSuggestion + filtra optimisticamente', () => {
    notesStore.setRow('notes', 'n11', { noteType: 'fleeting' });
    const { result } = renderHook(() => useNoteSuggestions('n11'), { wrapper });
    emitRemote({
      suggestedNoteType: 'literature',
      noteTypeConfidence: 0.8,
      dismissedSuggestions: [],
    });

    const suggestion = result.current.suggestions[0];
    act(() => {
      result.current.accept(suggestion);
    });

    expect(acceptMock).toHaveBeenCalledWith('n11', 'promote-to-literature', {
      noteType: 'literature',
    });
    expect(result.current.suggestions).toEqual([]);
  });
});
