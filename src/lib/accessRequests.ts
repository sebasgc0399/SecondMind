import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import type { AccessRequest } from '@/types/accessRequest';

// SPEC-52 — wrappers cliente de los callables de solicitud de acceso.
//  - submitAccessRequest: PÚBLICO (sin auth). Propaga el error (resource-exhausted /
//    invalid-argument) para que el form lo mapee.
//  - listAccessRequests / processAccessRequest: admin-only (gate server-side por
//    ADMIN_EMAIL en la CF; el gate de la ruta /admin en cliente es solo cosmético).

const submitFn = httpsCallable<{ email: string; motivo?: string }, { ok: true }>(
  functions,
  'submitAccessRequest',
);
const listFn = httpsCallable<unknown, { requests: AccessRequest[] }>(
  functions,
  'listAccessRequests',
);
const processFn = httpsCallable<{ id: string; action: 'approve' | 'reject' }, { ok: true }>(
  functions,
  'processAccessRequest',
);

export async function submitAccessRequest(email: string, motivo?: string): Promise<void> {
  await submitFn(motivo ? { email, motivo } : { email });
}

export async function listAccessRequests(): Promise<AccessRequest[]> {
  const result = await listFn();
  return result.data.requests;
}

export async function processAccessRequest(
  id: string,
  action: 'approve' | 'reject',
): Promise<void> {
  await processFn({ id, action });
}
