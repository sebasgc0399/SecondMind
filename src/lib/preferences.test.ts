import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markDistillBannerSeen, parsePrefs } from '@/lib/preferences';
import { DEFAULT_PREFERENCES } from '@/types/preferences';

// Mocks de Firebase imitando el patrón de baseRepo.test.ts. parsePrefs es
// pura y no toca Firestore, pero markDistillBannerSeen sí — los mocks
// permiten verificar el path y el shape del setDoc.

const setDocMock = vi.fn();
const docMock = vi.fn((_db: object, path: string) => ({ __path: path }));

vi.mock('@/lib/firebase', () => ({
  db: {} as object,
}));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));

describe('parsePrefs', () => {
  it('doc inexistente (data undefined) → defaults completos', () => {
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it('trashAutoPurgeDays inválido → fallback al default 30', () => {
    expect(parsePrefs({ trashAutoPurgeDays: 99 }).trashAutoPurgeDays).toBe(30);
  });

  it('distillIntroSeen true → expone true', () => {
    expect(parsePrefs({ distillIntroSeen: true }).distillIntroSeen).toBe(true);
  });

  it('distillIntroSeen no boolean (string) → false', () => {
    expect(parsePrefs({ distillIntroSeen: 'yes' }).distillIntroSeen).toBe(false);
  });

  it('distillBannersSeen parcial → completa con defaults los faltantes', () => {
    expect(parsePrefs({ distillBannersSeen: { l1: true } }).distillBannersSeen).toEqual({
      l1: true,
      l2: false,
      l3: false,
    });
  });

  it('doc legacy sin distillIntroSeen ni distillBannersSeen → respeta valor válido y completa el resto con defaults', () => {
    const result = parsePrefs({ trashAutoPurgeDays: 7 });
    expect(result).toEqual({
      trashAutoPurgeDays: 7,
      distillIntroSeen: false,
      distillBannersSeen: { l1: false, l2: false, l3: false },
    });
  });
});

describe('markDistillBannerSeen', () => {
  beforeEach(() => {
    setDocMock.mockReset();
    docMock.mockClear();
    setDocMock.mockResolvedValue(undefined);
  });

  it('ejecuta setDoc con dot-notation y merge:true para nivel 1', async () => {
    await markDistillBannerSeen('user-x', 1);
    expect(docMock).toHaveBeenCalledWith({}, 'users/user-x/settings/preferences');
    expect(setDocMock).toHaveBeenCalledWith(
      { __path: 'users/user-x/settings/preferences' },
      { 'distillBannersSeen.l1': true },
      { merge: true },
    );
  });

  it('cada nivel actualiza un path Firestore único (l3)', async () => {
    await markDistillBannerSeen('user-y', 3);
    expect(setDocMock).toHaveBeenCalledWith(
      expect.anything(),
      { 'distillBannersSeen.l3': true },
      { merge: true },
    );
  });
});
