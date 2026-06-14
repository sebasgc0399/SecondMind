import { describe, it, expect } from 'vitest';
import { mapCfError } from './cfError';
import type { TFunction } from 'i18next';

// tMock: devuelve el defaultValue inline (copy es REAL), interpolando {{max}} si viene en
// opts. Asserta el COPY, no la key (un tMock que devolviera la key pasaría con copy roto).
// Los typos de key los caza tsc (resources.d.ts), complementario.
const t = ((key: string, defaultValue?: string, opts?: { max?: number }) => {
  const base = defaultValue ?? key;
  return opts?.max != null ? base.replace('{{max}}', String(opts.max)) : base;
}) as unknown as TFunction;

describe('mapCfError', () => {
  describe('lee el slug de details.code', () => {
    it('beta-full con maxUsers → copy interpolado', () => {
      expect(mapCfError({ details: { code: 'beta-full', maxUsers: 5 } }, t)).toBe(
        'Beta llena (5). Subí el límite o revocá un miembro antes de aprobar.',
      );
    });

    it('beta-full SIN maxUsers → variante betaFullNoMax', () => {
      expect(mapCfError({ details: { code: 'beta-full' } }, t)).toBe(
        'Beta llena. Subí el límite o revocá un miembro antes de aprobar.',
      );
    });

    it('rate-limited', () => {
      expect(mapCfError({ details: { code: 'rate-limited' } }, t)).toBe(
        'Demasiados intentos. Probá de nuevo más tarde.',
      );
    });

    it('save-key-invalid (BYOK accionable, key propia)', () => {
      expect(mapCfError({ details: { code: 'save-key-invalid' } }, t)).toBe(
        'La API key es inválida.',
      );
    });

    it('submit-access-request-motivo-too-long → submitInvalidMotivo', () => {
      expect(mapCfError({ details: { code: 'submit-access-request-motivo-too-long' } }, t)).toBe(
        'El motivo no es válido.',
      );
    });

    it('access-request-invalid-id → invalidInput generico', () => {
      expect(mapCfError({ details: { code: 'access-request-invalid-id' } }, t)).toBe(
        'Datos inválidos. Probá de nuevo.',
      );
    });
  });

  describe('consolidacion many-to-one (slug especifico server → key compartida cliente)', () => {
    it('los 3 slugs unauthenticated → la MISMA key errors.unauthenticated', () => {
      const expected = 'Tenés que iniciar sesión.';
      expect(mapCfError({ details: { code: 'admin-unauthenticated' } }, t)).toBe(expected);
      expect(mapCfError({ details: { code: 'verified-unauthenticated' } }, t)).toBe(expected);
      expect(mapCfError({ details: { code: 'check-access-unauthenticated' } }, t)).toBe(expected);
    });

    it('invalidProvider compartido por save y delete', () => {
      const expected = 'Proveedor no soportado.';
      expect(mapCfError({ details: { code: 'save-key-invalid-provider' } }, t)).toBe(expected);
      expect(mapCfError({ details: { code: 'delete-key-invalid-provider' } }, t)).toBe(expected);
    });

    it('los 5 internal/*-failed colapsan a operationFailed', () => {
      const expected = 'No se pudo completar la operación. Probá de nuevo.';
      for (const code of [
        'process-access-request-failed',
        'revoke-access-failed',
        'submit-access-request-failed',
        'save-key-failed',
        'delete-key-failed',
      ]) {
        expect(mapCfError({ details: { code } }, t)).toBe(expected);
      }
    });
  });

  describe('precedencia details.code ?? code', () => {
    it('details.code gana sobre err.code (grpc)', () => {
      expect(
        mapCfError({ code: 'functions/internal', details: { code: 'beta-full', maxUsers: 3 } }, t),
      ).toBe('Beta llena (3). Subí el límite o revocá un miembro antes de aprobar.');
    });

    it('sin details, un err.code grpc desconocido → default', () => {
      expect(mapCfError({ code: 'functions/internal' }, t)).toBe(
        'Algo salió mal. Intentá de nuevo.',
      );
    });
  });

  describe('fallback errors.default — nunca key cruda', () => {
    it('slug desconocido → default', () => {
      expect(mapCfError({ details: { code: 'no-existe' } }, t)).toBe(
        'Algo salió mal. Intentá de nuevo.',
      );
    });

    it('embed-query-* (sin key de catalogo, consumidor silencioso) → default', () => {
      expect(mapCfError({ details: { code: 'embed-query-failed' } }, t)).toBe(
        'Algo salió mal. Intentá de nuevo.',
      );
    });

    it('err null / undefined → default sin throw', () => {
      expect(mapCfError(null, t)).toBe('Algo salió mal. Intentá de nuevo.');
      expect(mapCfError(undefined, t)).toBe('Algo salió mal. Intentá de nuevo.');
    });

    it('err sin code ni details → default', () => {
      expect(mapCfError({}, t)).toBe('Algo salió mal. Intentá de nuevo.');
    });
  });
});
