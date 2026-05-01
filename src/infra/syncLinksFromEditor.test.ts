import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeLinksDiff,
  syncLinksFromEditor,
  type OldLinkEntry,
} from '@/infra/syncLinksFromEditor';
import type { ExtractedLink } from '@/lib/editor/extractLinks';

const syncLinksMock = vi.fn();
vi.mock('@/infra/repos/linksRepo', () => ({
  linksRepo: {
    syncLinks: (...args: unknown[]) => syncLinksMock(...args),
  },
  buildLinkId: (s: string, t: string) => `${s}__${t}`,
}));

const getTableMock = vi.fn();
vi.mock('@/stores/linksStore', () => ({
  linksStore: {
    getTable: () => getTableMock(),
  },
}));

const getRowMock = vi.fn();
const setPartialRowMock = vi.fn();
vi.mock('@/stores/notesStore', () => ({
  notesStore: {
    getRow: (table: string, id: string) => getRowMock(table, id),
    setPartialRow: (table: string, id: string, partial: object) =>
      setPartialRowMock(table, id, partial),
  },
}));

vi.mock('@/lib/tinybase', () => ({
  parseIds: (raw: string | undefined): string[] => {
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },
  stringifyIds: (ids: string[]): string => JSON.stringify(ids),
}));

describe('computeLinksDiff', () => {
  it('filtra self-links (targetId === sourceId)', () => {
    const newLinks: ExtractedLink[] = [
      { targetId: 'A', targetTitle: 'Self', context: '' },
      { targetId: 'B', targetTitle: 'Other', context: '' },
    ];
    const diff = computeLinksDiff(newLinks, [], 'A');
    expect(diff.toCreate).toHaveLength(1);
    expect(diff.toCreate[0]!.targetId).toBe('B');
    expect(diff.newTargetIds.has('A')).toBe(false);
    expect(diff.newTargetIds.has('B')).toBe(true);
  });

  it('dedupea por targetId (preserva el primero encontrado)', () => {
    const newLinks: ExtractedLink[] = [
      { targetId: 'B', targetTitle: 'B', context: 'first' },
      { targetId: 'B', targetTitle: 'B', context: 'second' },
    ];
    const diff = computeLinksDiff(newLinks, [], 'A');
    expect(diff.toCreate).toHaveLength(1);
    expect(diff.toCreate[0]!.context).toBe('first');
  });

  it('solo creates (oldLinks vacío)', () => {
    const newLinks: ExtractedLink[] = [
      { targetId: 'B', targetTitle: 'B', context: 'ctx' },
      { targetId: 'C', targetTitle: 'C', context: '' },
    ];
    const diff = computeLinksDiff(newLinks, [], 'A');
    expect(diff.toCreate).toHaveLength(2);
    expect(diff.toDeleteIds).toEqual([]);
    expect([...diff.affectedTargetIds].sort()).toEqual(['B', 'C']);
  });

  it('solo deletes (newLinks vacío)', () => {
    const oldLinks: OldLinkEntry[] = [
      { docId: 'A__B', targetId: 'B' },
      { docId: 'A__C', targetId: 'C' },
    ];
    const diff = computeLinksDiff([], oldLinks, 'A');
    expect(diff.toCreate).toEqual([]);
    expect([...diff.toDeleteIds].sort()).toEqual(['A__B', 'A__C']);
    expect([...diff.affectedTargetIds].sort()).toEqual(['B', 'C']);
  });

  it('mixed: creates + deletes + unchanged', () => {
    const newLinks: ExtractedLink[] = [
      { targetId: 'B', targetTitle: 'B', context: '' }, // unchanged
      { targetId: 'D', targetTitle: 'D', context: '' }, // create
    ];
    const oldLinks: OldLinkEntry[] = [
      { docId: 'A__B', targetId: 'B' }, // unchanged
      { docId: 'A__C', targetId: 'C' }, // delete
    ];
    const diff = computeLinksDiff(newLinks, oldLinks, 'A');
    expect(diff.toCreate.map((l) => l.targetId)).toEqual(['D']);
    expect(diff.toDeleteIds).toEqual(['A__C']);
    expect([...diff.affectedTargetIds].sort()).toEqual(['C', 'D']);
    expect(diff.newTargetIds.has('B')).toBe(true);
    expect(diff.newTargetIds.has('D')).toBe(true);
    expect(diff.newTargetIds.has('C')).toBe(false);
  });
});

describe('syncLinksFromEditor', () => {
  beforeEach(() => {
    syncLinksMock.mockReset();
    getTableMock.mockReset();
    getRowMock.mockReset();
    setPartialRowMock.mockReset();
    syncLinksMock.mockResolvedValue(undefined);
  });

  it('flow básico: sin oldLinks + 1 create → linksRepo.syncLinks + setPartialRow en target', async () => {
    getTableMock.mockReturnValue({});
    getRowMock.mockReturnValue({ incomingLinkIds: '[]' });

    const result = await syncLinksFromEditor({
      sourceId: 'A',
      sourceTitle: 'Source A',
      userId: 'uid-1',
      newLinks: [{ targetId: 'B', targetTitle: 'B', context: '' }],
    });

    expect(syncLinksMock).toHaveBeenCalledOnce();
    expect(syncLinksMock.mock.calls[0]![0]).toEqual({
      sourceId: 'A',
      sourceTitle: 'Source A',
      userId: 'uid-1',
      toCreate: [{ targetId: 'B', targetTitle: 'B', context: '' }],
      toDeleteIds: [],
    });

    expect(setPartialRowMock).toHaveBeenCalledOnce();
    expect(setPartialRowMock.mock.calls[0]).toEqual(['notes', 'B', { incomingLinkIds: '["A"]' }]);

    expect(result).toEqual({ outgoingLinkIds: ['B'], linkCount: 1 });
  });

  it('skip setPartialRow cuando incomingLinkIds no cambia (sameIdSet shortcircuit)', async () => {
    getTableMock.mockReturnValue({});
    getRowMock.mockReturnValue({ incomingLinkIds: '["A"]' });

    await syncLinksFromEditor({
      sourceId: 'A',
      sourceTitle: 'Source A',
      userId: 'uid-1',
      newLinks: [{ targetId: 'B', targetTitle: 'B', context: '' }],
    });

    expect(setPartialRowMock).not.toHaveBeenCalled();
  });

  it('skip target inexistente en notesStore (row vacío)', async () => {
    getTableMock.mockReturnValue({});
    getRowMock.mockReturnValue({});

    await syncLinksFromEditor({
      sourceId: 'A',
      sourceTitle: 'Source A',
      userId: 'uid-1',
      newLinks: [{ targetId: 'B', targetTitle: 'B', context: '' }],
    });

    expect(syncLinksMock).toHaveBeenCalledOnce();
    expect(setPartialRowMock).not.toHaveBeenCalled();
  });

  it('delete: remueve sourceId de incomingLinkIds del target', async () => {
    getTableMock.mockReturnValue({
      A__B: { sourceId: 'A', targetId: 'B' },
    });
    getRowMock.mockReturnValue({ incomingLinkIds: '["A","X"]' });

    await syncLinksFromEditor({
      sourceId: 'A',
      sourceTitle: 'Source A',
      userId: 'uid-1',
      newLinks: [],
    });

    expect(syncLinksMock.mock.calls[0]![0]).toMatchObject({
      toCreate: [],
      toDeleteIds: ['A__B'],
    });

    expect(setPartialRowMock).toHaveBeenCalledOnce();
    expect(setPartialRowMock.mock.calls[0]).toEqual(['notes', 'B', { incomingLinkIds: '["X"]' }]);
  });

  it('orden Firestore-first / TinyBase-second', async () => {
    getTableMock.mockReturnValue({});
    getRowMock.mockReturnValue({ incomingLinkIds: '[]' });

    const callOrder: string[] = [];
    syncLinksMock.mockImplementation(async () => {
      callOrder.push('firestore');
    });
    setPartialRowMock.mockImplementation(() => {
      callOrder.push('tinybase');
    });

    await syncLinksFromEditor({
      sourceId: 'A',
      sourceTitle: 'Source A',
      userId: 'uid-1',
      newLinks: [{ targetId: 'B', targetTitle: 'B', context: '' }],
    });

    expect(callOrder).toEqual(['firestore', 'tinybase']);
  });
});
