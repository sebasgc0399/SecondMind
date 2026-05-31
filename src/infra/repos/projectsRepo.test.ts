import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectsRepo } from '@/infra/repos/projectsRepo';
import { projectsStore } from '@/stores/projectsStore';

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
  projectsStore.delTables();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('projectsRepo.createProject', () => {
  it('nombre vacío o solo espacios → null, sin tocar Firestore', async () => {
    expect(
      await projectsRepo.createProject({ name: '   ', areaId: 'a1', priority: 'medium' }),
    ).toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('crea con defaults serializados (taskIds/noteIds "[]", status not-started)', async () => {
    const id = await projectsRepo.createProject({
      name: '  Mi proyecto  ',
      areaId: 'a1',
      priority: 'high',
    });
    await vi.advanceTimersByTimeAsync(250);

    expect(id).toBeTruthy();
    expect(projectsStore.getCell('projects', id!, 'name')).toBe('Mi proyecto');
    expect(firstPayload()).toEqual({
      name: 'Mi proyecto',
      status: 'not-started',
      priority: 'high',
      areaId: 'a1',
      objectiveId: '',
      taskIds: '[]',
      noteIds: '[]',
      startDate: 0,
      deadline: 0,
      isArchived: false,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });
});

describe('projectsRepo.updateProject (loop skip-by-key + stringifyIds de taskIds/noteIds)', () => {
  it('skip "id", skip undefined, copia primitivos, serializa taskIds y noteIds', async () => {
    await projectsRepo.updateProject('p1', {
      id: 'ESTE_ID_SE_IGNORA',
      name: 'Renombrado',
      isArchived: true,
      deadline: undefined,
      taskIds: ['t1'],
      noteIds: ['n1', 'n2'],
    });
    await vi.advanceTimersByTimeAsync(250);

    expect(firstPayload()).toEqual({
      updatedAt: expect.any(Number),
      name: 'Renombrado',
      isArchived: true,
      taskIds: '["t1"]',
      noteIds: '["n1","n2"]',
    });
  });

  it('arrays omitidos → no aparecen; arrays vacíos → "[]"', async () => {
    await projectsRepo.updateProject('p1', { name: 'Solo nombre' });
    await vi.advanceTimersByTimeAsync(250);
    expect(firstPayload()).toEqual({ updatedAt: expect.any(Number), name: 'Solo nombre' });

    setDocMock.mockClear();
    await projectsRepo.updateProject('p2', { taskIds: [], noteIds: [] });
    await vi.advanceTimersByTimeAsync(250);
    expect(firstPayload()).toEqual({ updatedAt: expect.any(Number), taskIds: '[]', noteIds: '[]' });
  });
});
