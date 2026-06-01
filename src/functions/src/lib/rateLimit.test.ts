import { describe, expect, it } from 'vitest';
import { computeWindows, exceedsLimit } from './rateLimit';

// SPEC-51 F7 — unit de la LÓGICA PURA del rate-limiter (slots, expireAt, borde del
// umbral). El I/O Firestore de enforceRateLimit se verifica E2E (no hay mock de admin).
describe('rateLimit — lógica pura (SPEC-51 F7)', () => {
  describe('computeWindows', () => {
    const nowMs = 1_800_000_123_456; // instante fijo (Date.now() no se usa acá)

    it('genera docs de minuto y día con IDs y límites correctos', () => {
      const windows = computeWindows('uid1', 'embedQuery', { perMinute: 60, perDay: 1000 }, nowMs);
      const minuteSlot = Math.floor(nowMs / 60_000);
      const daySlot = Math.floor(nowMs / 86_400_000);
      expect(windows).toHaveLength(2);
      expect(windows[0].docId).toBe(`uid1__embedQuery__min__${minuteSlot}`);
      expect(windows[0].limit).toBe(60);
      expect(windows[1].docId).toBe(`uid1__embedQuery__day__${daySlot}`);
      expect(windows[1].limit).toBe(1000);
    });

    it('expireAt deja 2 ventanas de gracia sobre el slot', () => {
      const windows = computeWindows('u', 'k', { perMinute: 1, perDay: 1 }, nowMs);
      const minuteSlot = Math.floor(nowMs / 60_000);
      const daySlot = Math.floor(nowMs / 86_400_000);
      expect(windows[0].expireAtMs).toBe((minuteSlot + 2) * 60_000);
      expect(windows[1].expireAtMs).toBe((daySlot + 2) * 86_400_000);
    });

    it('el slot de minuto cambia al cruzar la ventana (reset por doc-id nuevo)', () => {
      const base = 100 * 60_000; // inicio exacto de un minuto
      const before = computeWindows('u', 'k', { perMinute: 1, perDay: 1 }, base + 59_999);
      const after = computeWindows('u', 'k', { perMinute: 1, perDay: 1 }, base + 60_000);
      expect(before[0].docId).not.toBe(after[0].docId);
    });
  });

  describe('exceedsLimit', () => {
    it('count igual al límite NO excede; uno más SÍ', () => {
      expect(exceedsLimit(60, 60)).toBe(false);
      expect(exceedsLimit(61, 60)).toBe(true);
      expect(exceedsLimit(1, 60)).toBe(false);
    });
  });
});
