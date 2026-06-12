import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREFERENCES_SCHEMA_VERSION,
  markDistillBannerSeen,
  parsePrefs,
  setPreferences,
} from '@/lib/preferences';
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
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
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
      sidebarHidden: false,
      splitPaneLayout: { left: 50, right: 50 },
      onboardingWelcomeSeen: false,
      onboardingChecklistDismissed: false,
      locale: null,
    });
  });

  it('sidebarHidden no persistido → default false', () => {
    expect(parsePrefs({}).sidebarHidden).toBe(false);
  });

  it('sidebarHidden true → expone true', () => {
    expect(parsePrefs({ sidebarHidden: true }).sidebarHidden).toBe(true);
  });

  it('sidebarHidden truthy no-boolean (string, número) → false', () => {
    expect(parsePrefs({ sidebarHidden: 'yes' }).sidebarHidden).toBe(false);
    expect(parsePrefs({ sidebarHidden: 1 }).sidebarHidden).toBe(false);
  });

  // F46.1: splitPaneLayout — campo aditivo con shape { left: number; right: number }.
  // Validación defensiva en parseSplitPaneLayout: cualquier shape inválido cae
  // al default { left: 50, right: 50 } (handle al centro).

  it('splitPaneLayout no persistido → default { left: 50, right: 50 } (F46)', () => {
    expect(parsePrefs({}).splitPaneLayout).toEqual({ left: 50, right: 50 });
  });

  it('splitPaneLayout shape válido → expone tal cual', () => {
    expect(parsePrefs({ splitPaneLayout: { left: 35, right: 65 } }).splitPaneLayout).toEqual({
      left: 35,
      right: 65,
    });
  });

  it('splitPaneLayout shape inválido (left no numérico) → fallback al default', () => {
    expect(parsePrefs({ splitPaneLayout: { left: 'wide', right: 50 } }).splitPaneLayout).toEqual({
      left: 50,
      right: 50,
    });
  });

  it('splitPaneLayout shape parcial (sin right) → fallback al default', () => {
    expect(parsePrefs({ splitPaneLayout: { left: 60 } }).splitPaneLayout).toEqual({
      left: 50,
      right: 50,
    });
  });

  it('splitPaneLayout no objeto (string, null) → fallback al default', () => {
    expect(parsePrefs({ splitPaneLayout: 'horizontal' }).splitPaneLayout).toEqual({
      left: 50,
      right: 50,
    });
    expect(parsePrefs({ splitPaneLayout: null }).splitPaneLayout).toEqual({
      left: 50,
      right: 50,
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
      { 'distillBannersSeen.l1': true, _schemaVersion: 1 },
    );
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('cada nivel actualiza un path Firestore único (l3)', async () => {
    await markDistillBannerSeen('user-y', 3);
    expect(updateDocMock).toHaveBeenCalledWith(expect.anything(), {
      'distillBannersSeen.l3': true,
      _schemaVersion: 1,
    });
  });

  it('si updateDoc falla con not-found cae a setDoc con objeto nested', async () => {
    const { FirebaseError } = await import('firebase/app');
    updateDocMock.mockRejectedValueOnce(new FirebaseError('not-found', 'no doc'));

    await markDistillBannerSeen('user-z', 2);

    expect(updateDocMock).toHaveBeenCalledOnce();
    expect(setDocMock).toHaveBeenCalledWith(
      expect.anything(),
      { distillBannersSeen: { l2: true }, _schemaVersion: 1 },
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

describe('parsePrefs schema versioning (F36.F8)', () => {
  it('PREFERENCES_SCHEMA_VERSION exportada = 1 (sentinel para detectar bumps no intencionales)', () => {
    expect(PREFERENCES_SCHEMA_VERSION).toBe(1);
  });

  it('doc con _schemaVersion=1 + prefs válidas → parse normal (D-F8.1)', () => {
    expect(parsePrefs({ _schemaVersion: 1, distillIntroSeen: true, sidebarHidden: true })).toEqual({
      trashAutoPurgeDays: 30,
      distillIntroSeen: true,
      distillBannersSeen: { l1: false, l2: false, l3: false },
      sidebarHidden: true,
      splitPaneLayout: { left: 50, right: 50 },
      onboardingWelcomeSeen: false,
      onboardingChecklistDismissed: false,
      locale: null,
    });
  });

  it('doc con _schemaVersion=99 (mismatch) → DEFAULT_PREFERENCES descartando contenido', () => {
    expect(parsePrefs({ _schemaVersion: 99, distillIntroSeen: true, sidebarHidden: true })).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it('doc con _schemaVersion="1" string presente → DEFAULT (guard estricto D-F8.6)', () => {
    expect(parsePrefs({ _schemaVersion: '1', distillIntroSeen: true })).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it('doc legacy sin _schemaVersion → parse compat V1 (cohorte pre-F8 D-F8.1)', () => {
    expect(parsePrefs({ distillIntroSeen: true, sidebarHidden: true })).toEqual({
      trashAutoPurgeDays: 30,
      distillIntroSeen: true,
      distillBannersSeen: { l1: false, l2: false, l3: false },
      sidebarHidden: true,
      splitPaneLayout: { left: 50, right: 50 },
      onboardingWelcomeSeen: false,
      onboardingChecklistDismissed: false,
      locale: null,
    });
  });
});

// F58: locale — campo aditivo (sin bump, mismo criterio que splitPaneLayout/F49).
// null = "nunca elegido" → useLocaleSync detecta y persiste eager.
describe('parsePrefs locale (F58)', () => {
  it('locale no persistido → null (nunca elegido, aplica detección)', () => {
    expect(parsePrefs({}).locale).toBeNull();
  });

  it("locale 'es' / 'en' válidos → se exponen tal cual", () => {
    expect(parsePrefs({ locale: 'es' }).locale).toBe('es');
    expect(parsePrefs({ locale: 'en' }).locale).toBe('en');
  });

  it('locale inválido (otro idioma, número, boolean, objeto) → null defensivo', () => {
    expect(parsePrefs({ locale: 'fr' }).locale).toBeNull();
    expect(parsePrefs({ locale: 1 }).locale).toBeNull();
    expect(parsePrefs({ locale: true }).locale).toBeNull();
    expect(parsePrefs({ locale: { lang: 'es' } }).locale).toBeNull();
  });
});

describe('setPreferences schema versioning (F36.F8)', () => {
  beforeEach(() => {
    setDocMock.mockReset();
    docMock.mockClear();
    setDocMock.mockResolvedValue(undefined);
  });

  it('inyecta _schemaVersion=1 en cada write (marker del cliente que persistió, D-F8.4)', async () => {
    await setPreferences('user-a', { sidebarHidden: true });
    expect(setDocMock).toHaveBeenCalledWith(
      { __path: 'users/user-a/settings/preferences' },
      { sidebarHidden: true, _schemaVersion: 1 },
      { merge: true },
    );
  });
});
