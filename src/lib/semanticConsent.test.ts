import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markSemanticConsentAcknowledged,
  parseSemanticConsent,
  setSemanticSearchEnabled,
} from '@/lib/semanticConsent';
import { DEFAULT_SEMANTIC_CONSENT } from '@/types/semanticConsent';

// SPEC-66 F1 — mocks de Firebase (mismo patrón que preferences.test.ts).
// parseSemanticConsent es pura; los writes (markAcknowledged/setEnabled) tocan
// Firestore → el mock verifica path + shape del setDoc.

const setDocMock = vi.fn();
const docMock = vi.fn((_db: object, path: string) => ({ __path: path }));

// consent server-authoritative — el reconocimiento pasa por el callable
// markSemanticConsent. httpsCallable se invoca al CARGAR el módulo (const a nivel
// módulo) con ('markSemanticConsent'); el callable resuelto se llama por uso. Por
// eso los mocks van en vi.hoisted: el setDoc/doc se llaman recién en test-run (los
// const alcanzan a inicializarse), pero httpsCallable corre durante el import →
// necesita estar disponible ANTES (vi.hoisted corre antes que todo).
const { httpsCallableMock, markConsentCallableMock } = vi.hoisted(() => {
  const markConsentCallableMock = vi
    .fn()
    .mockResolvedValue({ data: { ok: true, acknowledgedAt: 1700000000000 } });
  const httpsCallableMock = vi.fn((..._args: unknown[]) => markConsentCallableMock);
  return { httpsCallableMock, markConsentCallableMock };
});

vi.mock('@/lib/firebase', () => ({
  db: {} as object,
  functions: {} as object,
}));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => httpsCallableMock(...args),
}));

beforeEach(() => {
  setDocMock.mockReset();
  docMock.mockClear();
  // NO limpiar httpsCallableMock: su única llamada fue al cargar el módulo (la
  // assertion del nombre del callable depende de ese registro).
  markConsentCallableMock.mockClear();
});

describe('parseSemanticConsent (SPEC-66 F1)', () => {
  it('doc ausente (undefined) → DEFAULT inerte', () => {
    expect(parseSemanticConsent(undefined)).toEqual(DEFAULT_SEMANTIC_CONSENT);
  });

  it('objeto vacío → enabled:false, acknowledgedAt:null', () => {
    expect(parseSemanticConsent({})).toEqual({ enabled: false, acknowledgedAt: null });
  });

  it('valores válidos → preservados', () => {
    expect(parseSemanticConsent({ enabled: true, acknowledgedAt: 1700000000000 })).toEqual({
      enabled: true,
      acknowledgedAt: 1700000000000,
    });
  });

  it('enabled no-booleano → false (fail-closed)', () => {
    expect(parseSemanticConsent({ enabled: 'true' }).enabled).toBe(false);
    expect(parseSemanticConsent({ enabled: 1 }).enabled).toBe(false);
  });

  it('acknowledgedAt no-number → null', () => {
    expect(parseSemanticConsent({ acknowledgedAt: '1700000000000' }).acknowledgedAt).toBe(null);
    expect(parseSemanticConsent({ acknowledgedAt: null }).acknowledgedAt).toBe(null);
  });

  it('parcial (enabled sin acknowledgedAt) → enabled:true, acknowledgedAt:null', () => {
    expect(parseSemanticConsent({ enabled: true })).toEqual({
      enabled: true,
      acknowledgedAt: null,
    });
  });
});

describe('markSemanticConsentAcknowledged (consent server-authoritative)', () => {
  it('invoca el callable markSemanticConsent con locale + appVersion, NO escribe el doc desde el cliente', async () => {
    await markSemanticConsentAcknowledged('uid-1', 'es', '1.2.3');
    // El callable se resolvió desde httpsCallable(functions, 'markSemanticConsent').
    expect(httpsCallableMock).toHaveBeenCalledWith(expect.anything(), 'markSemanticConsent');
    expect(markConsentCallableMock).toHaveBeenCalledTimes(1);
    expect(markConsentCallableMock).toHaveBeenCalledWith({ locale: 'es', appVersion: '1.2.3' });
    // El reconocimiento ya NO es un setDoc client-side (es server-authoritative).
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('appVersion es opcional (se pasa undefined si no se provee)', async () => {
    await markSemanticConsentAcknowledged('uid-1', 'en');
    expect(markConsentCallableMock).toHaveBeenCalledWith({ locale: 'en', appVersion: undefined });
  });
});

describe('setSemanticSearchEnabled (SPEC-66 F1)', () => {
  it('setea solo enabled, SIN tocar acknowledgedAt (D6), merge', async () => {
    await setSemanticSearchEnabled('uid-1', false);
    const [, payload, options] = setDocMock.mock.calls[0]!;
    expect(payload).toEqual({ enabled: false });
    expect('acknowledgedAt' in payload).toBe(false);
    expect(options).toEqual({ merge: true });
  });
});
