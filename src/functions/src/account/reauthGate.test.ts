import { describe, it, expect } from 'vitest';
import { isReauthExpired, REAUTH_MAX_AGE_S } from './reauthGate';

// SPEC-64 F1 (D3) — el gate de reauth se valida acá por unit (no en E2E): el Auth
// emulator siempre emite tokens con auth_time = ahora, así que el RECHAZO por
// token viejo no es reproducible contra el emulador. La aceptación (token fresco)
// sí queda cubierta por el happy path E2E.

describe('isReauthExpired (gate de reauth D3)', () => {
  const nowMs = 1_700_000_000_000;
  const nowS = nowMs / 1000;

  it('reauth recién hecho → NO expirado (permite)', () => {
    expect(isReauthExpired(nowS, nowMs)).toBe(false);
  });

  it('reauth dentro de la ventana (4 min) → NO expirado', () => {
    expect(isReauthExpired(nowS - 240, nowMs)).toBe(false);
  });

  it('justo en el borde (300 s) → NO expirado (compara con >, no >=)', () => {
    expect(isReauthExpired(nowS - REAUTH_MAX_AGE_S, nowMs)).toBe(false);
  });

  it('un segundo más allá del borde → expirado (rechaza)', () => {
    expect(isReauthExpired(nowS - REAUTH_MAX_AGE_S - 1, nowMs)).toBe(true);
  });

  it('reauth viejo (6 min) → expirado', () => {
    expect(isReauthExpired(nowS - 360, nowMs)).toBe(true);
  });

  it('auth_time no finito (NaN) → expirado (fail-closed)', () => {
    expect(isReauthExpired(Number.NaN, nowMs)).toBe(true);
  });

  it('auth_time en el futuro → NO expirado (no rechaza por skew negativo)', () => {
    expect(isReauthExpired(nowS + 60, nowMs)).toBe(false);
  });
});
