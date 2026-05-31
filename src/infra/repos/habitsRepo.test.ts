import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { habitsRepo } from '@/infra/repos/habitsRepo';
import { habitsStore } from '@/stores/habitsStore';

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

// HABITS tiene 14 entradas → progress = round(activos / 14 * 100).
// 1→7, 3→21, 4→29.
function firstPayload(): Record<string, unknown> {
  return setDocMock.mock.calls[0]![1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  setDocMock.mockReset();
  setDocMock.mockResolvedValue(undefined);
  deleteDocMock.mockReset();
  deleteDocMock.mockResolvedValue(undefined);
  docMock.mockClear();
  habitsStore.delTables();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('habitsRepo.toggleHabit — row nueva', () => {
  it('primer toggle: marca el hábito, progress = 1/14 ≈ 7 y agrega date + createdAt', async () => {
    await habitsRepo.toggleHabit('2026-05-31', 'meditar');
    await vi.advanceTimersByTimeAsync(250);

    const payload = firstPayload();
    // computeNextProgress: 1 de 14 hábitos activos → round(1/14*100) = 7.
    expect(payload).toMatchObject({ meditar: true, progress: 7 });
    // Row nueva → se materializa date (parseado del dateKey) + createdAt.
    expect(payload.date).toEqual(expect.any(Number));
    expect(payload.createdAt).toEqual(expect.any(Number));
    expect(payload.updatedAt).toEqual(expect.any(Number));
    expect(payload.date as number).toBeGreaterThan(0);
  });
});

describe('habitsRepo.toggleHabit — row existente (computeNextProgress sobre el row actual)', () => {
  it('con 2 hábitos activos, activar un 3ro → progress = 3/14 ≈ 21, sin date/createdAt', async () => {
    // El schema completa los defaults (resto de hábitos en false).
    habitsStore.setRow('habits', '2026-05-31', { ejercicio: true, codear: true });

    await habitsRepo.toggleHabit('2026-05-31', 'leer');
    await vi.advanceTimersByTimeAsync(250);

    expect(firstPayload()).toEqual({
      leer: true,
      progress: 21,
      updatedAt: expect.any(Number),
    });
  });

  it('apagar un hábito activo → progress baja (1 activo → 0)', async () => {
    habitsStore.setRow('habits', '2026-05-31', { meditar: true });

    await habitsRepo.toggleHabit('2026-05-31', 'meditar');
    await vi.advanceTimersByTimeAsync(250);

    expect(firstPayload()).toEqual({
      meditar: false,
      progress: 0,
      updatedAt: expect.any(Number),
    });
  });

  it('optimistic: el progress se refleja en TinyBase antes del flush async', async () => {
    habitsStore.setRow('habits', '2026-05-31', { leer: true, tomarAgua: true, madrugar: true });

    await habitsRepo.toggleHabit('2026-05-31', 'ejercicio');
    // 4 de 14 activos → round(4/14*100) = 29, ya visible sin avanzar timers.
    expect(habitsStore.getCell('habits', '2026-05-31', 'progress')).toBe(29);
    expect(habitsStore.getCell('habits', '2026-05-31', 'ejercicio')).toBe(true);

    await vi.advanceTimersByTimeAsync(250);
  });
});
