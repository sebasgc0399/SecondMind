// SPEC-53 F1 — decisión de capacity de una aprobación, PURA (sin I/O, separada de la
// transacción que la consume). El enforcement del límite de la beta vive en la APROBACIÓN
// (acción admin síncrona), no en el signup: cuenta la allowlist real. Un miembro ya
// existente (re-aprobación) NUNCA consume slot → pasa aunque la beta esté llena
// (idempotencia). Fail-closed: con maxUsers ausente = 0, solo pasan los ya-miembros.
export interface ApprovalCapacity {
  alreadyMember: boolean;
  current: number;
  maxUsers: number;
}

export function decideApproval({ alreadyMember, current, maxUsers }: ApprovalCapacity): boolean {
  return alreadyMember || current < maxUsers;
}
