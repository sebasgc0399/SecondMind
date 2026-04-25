import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markDistillBannerSeen, parsePrefs } from '@/lib/preferences';
import { DEFAULT_PREFERENCES } from '@/types/preferences';

// Mocks de Firebase imitando el patrón de baseRepo.test.ts. parsePrefs es
// pura y no toca Firestore, pero markDistillBannerSeen sí — los mocks
// permiten verificar el path y el shape del updateDoc/setDoc.

const setDocMock = vi.fn();
const updateDocMock = vi.fn();
const docMock = vi.fn((_db: object, path: string) => ({ __path: path }));

vi.mock('@/lib/firebase', () => ({
  db: {} as object,
}));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  FirebaseError: class FirebaseError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
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
    updateDocMock.mockReset();
    docMock.mockClear();
    updateDocMock.mockResolvedValue(undefined);
    setDocMock.mockResolvedValue(undefined);
  });

  it('ejecuta updateDoc con dot-notation para crear path nested', async () => {
    await markDistillBannerSeen('user-x', 1);
    expect(docMock).toHaveBeenCalledWith({}, 'users/user-x/settings/preferences');
    expect(updateDocMock).toHaveBeenCalledWith(
      { __path: 'users/user-x/settings/preferences' },
      { 'distillBannersSeen.l1': true },
    );
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('cada nivel actualiza un path Firestore único (l3)', async () => {
    await markDistillBannerSeen('user-y', 3);
    expect(updateDocMock).toHaveBeenCalledWith(expect.anything(), {
      'distillBannersSeen.l3': true,
    });
  });

  it('si updateDoc falla con not-found cae a setDoc con objeto nested', async () => {
    const { FirebaseError } = await import('firebase/app');
    updateDocMock.mockRejectedValueOnce(new FirebaseError('not-found', 'no doc'));

    await markDistillBannerSeen('user-z', 2);

    expect(updateDocMock).toHaveBeenCalledOnce();
    expect(setDocMock).toHaveBeenCalledWith(
      expect.anything(),
      { distillBannersSeen: { l2: true } },
      { merge: true },
    );
  });

  it('errores no-not-found se re-lanzan sin caer a setDoc', async () => {
    const { FirebaseError } = await import('firebase/app');
    updateDocMock.mockRejectedValueOnce(new FirebaseError('permission-denied', 'no perms'));

    await expect(markDistillBannerSeen('user-w', 1)).rejects.toThrow(/no perms/);
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
