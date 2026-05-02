import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLinkId, linksRepo } from '@/infra/repos/linksRepo';

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } as { uid: string } | null },
  db: {} as object,
}));

const setDocMock = vi.fn();
const deleteDocMock = vi.fn();
const docMock = vi.fn((_db: object, path: string) => ({ __path: path }));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
}));

describe('buildLinkId', () => {
  it('compone source__target determinístico', () => {
    expect(buildLinkId('A', 'B')).toBe('A__B');
    expect(buildLinkId('note-x', 'note-y')).toBe('note-x__note-y');
  });
});

describe('linksRepo.syncLinks', () => {
  beforeEach(() => {
    setDocMock.mockReset();
    deleteDocMock.mockReset();
    docMock.mockClear();
    setDocMock.mockResolvedValue(undefined);
    deleteDocMock.mockResolvedValue(undefined);
  });

  it('diff vacío → cero writes', async () => {
    await linksRepo.syncLinks({
      sourceId: 'A',
      sourceTitle: 'Source',
      userId: 'uid-1',
      toCreate: [],
      toDeleteIds: [],
    });
    expect(setDocMock).not.toHaveBeenCalled();
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('solo creates → N setDocs con shape correcto y paths determinísticos', async () => {
    await linksRepo.syncLinks({
      sourceId: 'A',
      sourceTitle: 'Source A',
      userId: 'uid-1',
      toCreate: [
        { targetId: 'B', targetTitle: 'Target B', context: 'snippet B' },
        { targetId: 'C', targetTitle: 'Target C' },
      ],
      toDeleteIds: [],
    });

    expect(setDocMock).toHaveBeenCalledTimes(2);
    expect(deleteDocMock).not.toHaveBeenCalled();

    const firstCall = setDocMock.mock.calls[0]!;
    expect(firstCall[0]).toEqual({ __path: 'users/uid-1/links/A__B' });
    expect(firstCall[1]).toEqual({
      sourceId: 'A',
      targetId: 'B',
      sourceTitle: 'Source A',
      targetTitle: 'Target B',
      context: 'snippet B',
      linkType: 'explicit',
      strength: 0,
      accepted: true,
      createdAt: expect.any(Number),
    });

    const secondCall = setDocMock.mock.calls[1]!;
    expect(secondCall[0]).toEqual({ __path: 'users/uid-1/links/A__C' });
    // context default '' cuando no viene en input
    expect((secondCall[1] as { context: string }).context).toBe('');
  });

  it('solo deletes → N deleteDocs con paths idénticos a los IDs provistos', async () => {
    await linksRepo.syncLinks({
      sourceId: 'A',
      sourceTitle: 'Source A',
      userId: 'uid-1',
      toCreate: [],
      toDeleteIds: ['A__B', 'A__C'],
    });

    expect(setDocMock).not.toHaveBeenCalled();
    expect(deleteDocMock).toHaveBeenCalledTimes(2);
    expect(deleteDocMock.mock.calls[0]![0]).toEqual({ __path: 'users/uid-1/links/A__B' });
    expect(deleteDocMock.mock.calls[1]![0]).toEqual({ __path: 'users/uid-1/links/A__C' });
  });

  it('creates + deletes en paralelo en una sola Promise.all', async () => {
    // Pendientes para validar paralelismo: ambos calls deben estar en flight
    // antes que cualquiera resuelva.
    let resolveSet: () => void = () => {};
    let resolveDel: () => void = () => {};
    setDocMock.mockImplementation(() => new Promise<void>((r) => (resolveSet = r)));
    deleteDocMock.mockImplementation(() => new Promise<void>((r) => (resolveDel = r)));

    const promise = linksRepo.syncLinks({
      sourceId: 'A',
      sourceTitle: 'Source A',
      userId: 'uid-1',
      toCreate: [{ targetId: 'B', targetTitle: 'B' }],
      toDeleteIds: ['A__C'],
    });

    // Ambos mocks se llamaron antes de que cualquiera resuelva.
    expect(setDocMock).toHaveBeenCalledOnce();
    expect(deleteDocMock).toHaveBeenCalledOnce();

    resolveSet();
    resolveDel();
    await promise;
  });

  it('userId vacío → path malformado (paridad pre-F38: caller responsable del guard)', async () => {
    await linksRepo.syncLinks({
      sourceId: 'A',
      sourceTitle: 'Source',
      userId: '',
      toCreate: [{ targetId: 'B', targetTitle: 'B' }],
      toDeleteIds: [],
    });
    // Sin throw — el caller (useNoteSave) ya guardea uid antes de invocar.
    expect(setDocMock.mock.calls[0]![0]).toEqual({ __path: 'users//links/A__B' });
  });
});
