import { describe, it, expect } from 'vitest';
import { decideApproval } from './capacity';

// SPEC-53 F1 — lógica PURA de la decisión de capacity (sin Firestore). El count() y la
// escritura a allowlist/ son I/O → smoke manual (estrategia A, ver SPEC-53). Acá: los casos
// del criterio de done — bajo/sobre límite + idempotencia (incluso con maxUsers = 0).

describe('decideApproval — capacity de aprobación (SPEC-53 F1)', () => {
  it('aprueba un email nuevo bajo el límite', () => {
    expect(decideApproval({ alreadyMember: false, current: 5, maxUsers: 10 })).toBe(true);
  });

  it('rechaza un email nuevo en el límite (beta llena)', () => {
    expect(decideApproval({ alreadyMember: false, current: 10, maxUsers: 10 })).toBe(false);
  });

  it('rechaza un email nuevo sobre el límite', () => {
    expect(decideApproval({ alreadyMember: false, current: 11, maxUsers: 10 })).toBe(false);
  });

  it('re-aprobar a un miembro existente NO consume slot (idempotente, beta llena)', () => {
    expect(decideApproval({ alreadyMember: true, current: 10, maxUsers: 10 })).toBe(true);
  });

  it('fail-closed: maxUsers = 0 bloquea nuevos pero permite re-aprobar miembros', () => {
    expect(decideApproval({ alreadyMember: false, current: 0, maxUsers: 0 })).toBe(false);
    expect(decideApproval({ alreadyMember: true, current: 0, maxUsers: 0 })).toBe(true);
  });
});
