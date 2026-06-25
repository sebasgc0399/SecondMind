import { describe, it, expect } from 'vitest';
import { SEMANTIC_NOTICE_VERSION as CLIENT_VERSION } from '@/types/semanticConsent';
import { SEMANTIC_NOTICE_VERSION as FUNCTIONS_VERSION } from '../functions/src/lib/semanticNoticeVersion';

// SPEC consent server-authoritative — paridad de SEMANTIC_NOTICE_VERSION entre el
// cliente (modal del aviso §7.1) y functions (gate + evidencia). La constante está
// DUPLICADA a propósito: el paquete de functions compila aislado y nunca importa
// del app src en producción. Este test cruza la frontera SOLO en test-time (Vitest
// resuelve ambos .ts; el tsc de functions ignora **/*.test.ts) y es la ÚNICA red
// que impide que driften: si el server sella una versión y el cliente muestra otra,
// la evidencia mentiría sobre QUÉ aviso vio el usuario. Es load-bearing, no opcional.
describe('SEMANTIC_NOTICE_VERSION — paridad cliente/functions', () => {
  it('cliente y functions declaran el MISMO valor (deben moverse en lockstep)', () => {
    expect(CLIENT_VERSION).toBe(FUNCTIONS_VERSION);
  });

  it('sentinel = 1 (un bump deliberado del aviso §7.1 debe tocar este test → visible en review)', () => {
    expect(CLIENT_VERSION).toBe(1);
  });
});
