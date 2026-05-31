import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksRepo } from '@/infra/repos/tasksRepo';
import { tasksStore } from '@/stores/tasksStore';

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
  // Imports transitivos de @/lib/tinybase (persister) — no se ejercitan acá.
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
  // jsdom de este entorno no expone crypto.randomUUID, que el factory usa en
  // create() cuando no se pasa id explícito. Lo stubbeamos sólo si falta.
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
  tasksStore.delTables();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('tasksRepo.createTask', () => {
  it('nombre vacío o solo espacios → null, sin tocar Firestore', async () => {
    expect(await tasksRepo.createTask('')).toBeNull();
    expect(await tasksRepo.createTask('   ')).toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('crea con defaults serializados (noteIds "[]", status y priority por defecto)', async () => {
    const id = await tasksRepo.createTask('  Comprar pan  ');
    await vi.advanceTimersByTimeAsync(250);

    expect(id).toBeTruthy();
    // Optimistic: la row ya está en TinyBase con el nombre trimmeado.
    expect(tasksStore.getCell('tasks', id!, 'name')).toBe('Comprar pan');
    // El payload a Firestore lleva los defaults con los id-arrays ya serializados.
    expect(firstPayload()).toEqual({
      name: 'Comprar pan',
      status: 'in-progress',
      priority: 'medium',
      dueDate: expect.any(Number),
      projectId: '',
      areaId: '',
      objectiveId: '',
      noteIds: '[]',
      description: '',
      isArchived: false,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
      completedAt: 0,
    });
  });

  it('respeta options (priority, projectId, areaId)', async () => {
    const id = await tasksRepo.createTask('Tarea', {
      priority: 'high',
      projectId: 'p1',
      areaId: 'a1',
    });
    await vi.advanceTimersByTimeAsync(250);

    expect(id).toBeTruthy();
    expect(firstPayload()).toMatchObject({ priority: 'high', projectId: 'p1', areaId: 'a1' });
  });
});

describe('tasksRepo.updateTask (loop serialización skip-by-key + stringifyIds)', () => {
  it('skip "id", skip undefined, copia primitivos, serializa noteIds y setea updatedAt', async () => {
    await tasksRepo.updateTask('t1', {
      id: 'ESTE_ID_SE_IGNORA',
      priority: 'low',
      status: undefined,
      noteIds: ['n1', 'n2'],
    });
    await vi.advanceTimersByTimeAsync(250);

    // El payload NO incluye 'id' (skip-by-key) ni 'status' (skip undefined);
    // noteIds llega serializado como JSON string; updatedAt siempre presente.
    expect(firstPayload()).toEqual({
      updatedAt: expect.any(Number),
      priority: 'low',
      noteIds: '["n1","n2"]',
    });
  });

  it('noteIds omitido → no aparece la cell; noteIds [] → "[]"', async () => {
    await tasksRepo.updateTask('t1', { priority: 'high' });
    await vi.advanceTimersByTimeAsync(250);
    expect(firstPayload()).toEqual({ updatedAt: expect.any(Number), priority: 'high' });

    setDocMock.mockClear();
    await tasksRepo.updateTask('t2', { noteIds: [] });
    await vi.advanceTimersByTimeAsync(250);
    expect(firstPayload()).toEqual({ updatedAt: expect.any(Number), noteIds: '[]' });
  });
});

describe('tasksRepo.completeTask', () => {
  it('in-progress → completed con completedAt; completed → in-progress con completedAt 0', async () => {
    tasksStore.setRow('tasks', 't1', { name: 'X', status: 'in-progress' });
    await tasksRepo.completeTask('t1');
    await vi.advanceTimersByTimeAsync(250);
    expect(firstPayload()).toMatchObject({ status: 'completed' });
    expect(firstPayload().completedAt as number).toBeGreaterThan(0);

    setDocMock.mockClear();
    tasksStore.setRow('tasks', 't1', { name: 'X', status: 'completed' });
    await tasksRepo.completeTask('t1');
    await vi.advanceTimersByTimeAsync(250);
    expect(firstPayload()).toMatchObject({ status: 'in-progress', completedAt: 0 });
  });
});
