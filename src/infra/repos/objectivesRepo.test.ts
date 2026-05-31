import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { objectivesRepo } from '@/infra/repos/objectivesRepo';
import { objectivesStore } from '@/stores/objectivesStore';

// Mock @/lib/firebase — auth.currentUser (lo lee requireUid del factory) + db stub.
vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } as { uid: string } | null },
  db: {} as object,
}));

// Mock firebase/firestore — stubs que el factory y @/lib/tinybase importan.
const setDocMock = vi.fn();
const deleteDocMock = vi.fn();
const docMock = vi.fn((_db: object, path: string) => ({ __path: path }));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  collection: vi.fn(),
  serverTimestamp: vi.fn(),
}));

let uuidSeq = 0;

function firstPayload(): Record<string, unknown> {
  return setDocMock.mock.calls[0]![1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    vi.stubGlobal('crypto', {
      randomUUID: () => `00000000-0000-4000-8000-${String(++uuidSeq).padStart(12, '0')}`,
    });
  }
  setDocMock.mockReset();
  setDocMock.mockResolvedValue(undefined);
  deleteDocMock.mockReset();
  deleteDocMock.mockResolvedValue(undefined);
  docMock.mockClear();
  objectivesStore.delTables();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('objectivesRepo.createObjective', () => {
  it('nombre vacío o solo espacios → null, sin tocar Firestore', async () => {
    expect(
      await objectivesRepo.createObjective({ name: '   ', areaId: 'a1', deadline: 0 }),
    ).toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('crea con defaults serializados (projectIds/taskIds "[]", status not-started)', async () => {
    const id = await objectivesRepo.createObjective({
      name: '  Mi objetivo  ',
      areaId: 'a1',
      deadline: 1234,
    });
    await vi.advanceTimersByTimeAsync(250);

    expect(id).toBeTruthy();
    expect(objectivesStore.getCell('objectives', id!, 'name')).toBe('Mi objetivo');
    expect(firstPayload()).toEqual({
      name: 'Mi objetivo',
      status: 'not-started',
      deadline: 1234,
      areaId: 'a1',
      projectIds: '[]',
      taskIds: '[]',
      isArchived: false,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });
});

describe('objectivesRepo.updateObjective (loop skip-by-key + stringifyIds de projectIds/taskIds)', () => {
  it('skip "id", skip undefined, copia primitivos, serializa projectIds y taskIds', async () => {
    await objectivesRepo.updateObjective('o1', {
      id: 'ESTE_ID_SE_IGNORA',
      name: 'Renombrado',
      isArchived: true,
      deadline: undefined,
      projectIds: ['p1'],
      taskIds: ['t1', 't2'],
    });
    await vi.advanceTimersByTimeAsync(250);

    expect(firstPayload()).toEqual({
      updatedAt: expect.any(Number),
      name: 'Renombrado',
      isArchived: true,
      projectIds: '["p1"]',
      taskIds: '["t1","t2"]',
    });
  });

  it('arrays omitidos → no aparecen; arrays vacíos → "[]"', async () => {
    await objectivesRepo.updateObjective('o1', { name: 'Solo nombre' });
    await vi.advanceTimersByTimeAsync(250);
    expect(firstPayload()).toEqual({ updatedAt: expect.any(Number), name: 'Solo nombre' });

    setDocMock.mockClear();
    await objectivesRepo.updateObjective('o2', { projectIds: [], taskIds: [] });
    await vi.advanceTimersByTimeAsync(250);
    expect(firstPayload()).toEqual({
      updatedAt: expect.any(Number),
      projectIds: '[]',
      taskIds: '[]',
    });
  });
});
