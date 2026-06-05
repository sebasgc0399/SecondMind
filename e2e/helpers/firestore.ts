import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, collection, getDocs, Timestamp } from 'firebase/firestore';
import { EMU } from './emulator';

// SPEC-55 F6 — seed/clear de Firestore reusando @firebase/rules-unit-testing (D7), mismo
// patrón que firestore.rules.test.ts. Mismo projectId + puerto 8080 que el runtime de
// functions (singleProjectMode) → ambos ven el MISMO Firestore. withSecurityRulesDisabled
// bypassa el deny-all para el seed y para las lecturas de verificación post-invocación.

let env: RulesTestEnvironment | null = null;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (env) return env;
  env = await initializeTestEnvironment({
    projectId: EMU.projectId,
    firestore: { host: EMU.host, port: EMU.firestorePort },
  });
  return env;
}

export async function clearAll(): Promise<void> {
  await (await getTestEnv()).clearFirestore();
}

export async function cleanupTestEnv(): Promise<void> {
  if (env) {
    await env.cleanup();
    env = null;
  }
}

// --- Seed (vía withSecurityRulesDisabled) ---

// addedAt se escribe como Timestamp (como en prod, donde es serverTimestamp): listAllowlistMembers
// solo convierte a epoch ms los valores que son `instanceof Timestamp` (un número → null).
export async function seedAllowlist(email: string, addedAtMs = 0): Promise<void> {
  const e = await getTestEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'allowlist', email), {
      addedAt: Timestamp.fromMillis(addedAtMs),
    });
  });
}

export async function seedAccessRequest(
  id: string,
  data: { email?: string; status?: string; motivo?: string } = {},
): Promise<void> {
  const e = await getTestEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'accessRequests', id), {
      email: data.email ?? id,
      status: data.status ?? 'pending',
      ...(data.motivo ? { motivo: data.motivo } : {}),
      createdAt: 0,
    });
  });
}

export async function seedConfig(maxUsers: number): Promise<void> {
  const e = await getTestEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'config', 'app'), { maxUsers });
  });
}

// --- Lecturas de verificación ---

type DocData = Record<string, unknown>;

export async function readAllowlist(email: string): Promise<DocData | null> {
  const e = await getTestEnv();
  let result: DocData | null = null;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), 'allowlist', email));
    result = snap.exists() ? (snap.data() as DocData) : null;
  });
  return result;
}

export async function readAccessRequest(id: string): Promise<DocData | null> {
  const e = await getTestEnv();
  let result: DocData | null = null;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), 'accessRequests', id));
    result = snap.exists() ? (snap.data() as DocData) : null;
  });
  return result;
}

export async function countAllowlist(): Promise<number> {
  const e = await getTestEnv();
  let count = 0;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(collection(ctx.firestore(), 'allowlist'));
    count = snap.size;
  });
  return count;
}
