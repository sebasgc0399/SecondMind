import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import type { AllowlistMember } from '@/types/allowlistMember';

// SPEC-53 — wrappers cliente de los callables admin-only de gestión de miembros. El gate
// real es server-side (requireAdmin por ADMIN_EMAIL en la CF); el gate de /admin en cliente
// es solo cosmético. Propagan el error para que la UI lo mapee.
const listFn = httpsCallable<unknown, { members: AllowlistMember[] }>(
  functions,
  'listAllowlistMembers',
);
const revokeFn = httpsCallable<{ email: string }, { ok: true }>(functions, 'revokeAccess');

export async function listAllowlistMembers(): Promise<AllowlistMember[]> {
  const result = await listFn();
  return result.data.members;
}

export async function revokeAccess(email: string): Promise<void> {
  await revokeFn({ email });
}
