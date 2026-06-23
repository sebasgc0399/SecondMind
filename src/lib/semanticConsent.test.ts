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

vi.mock('@/lib/firebase', () => ({
  db: {} as object,
}));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));

beforeEach(() => {
  setDocMock.mockReset();
  docMock.mockClear();
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

describe('markSemanticConsentAcknowledged (SPEC-66 F1)', () => {
  it('escribe enabled:true + acknowledgedAt number ATÓMICO en el doc dedicado, merge', async () => {
    await markSemanticConsentAcknowledged('uid-1');
    expect(docMock).toHaveBeenCalledWith(expect.anything(), 'users/uid-1/settings/semanticSearch');
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [, payload, options] = setDocMock.mock.calls[0]!;
    expect(payload.enabled).toBe(true);
    expect(typeof payload.acknowledgedAt).toBe('number');
    expect(options).toEqual({ merge: true });
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
