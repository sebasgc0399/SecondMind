// SPEC-53 — miembro actual de la beta (allowlist/), tal como lo devuelve la CF admin-only
// listAllowlistMembers. La existencia del doc ES la membresía; addedAt puede ser null (docs
// sembrados a mano antes de SPEC-52 pueden no tener el campo).
export interface AllowlistMember {
  email: string;
  addedAt: number | null;
}
