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

// --- SPEC-64 F1: seed + verificación del wipe de cuenta ---

// Subcolecciones reales bajo users/{uid}/ (areas y tags NO son colecciones).
const USER_SUBCOLLECTIONS = [
  'notes',
  'tasks',
  'projects',
  'objectives',
  'inbox',
  'habits',
  'links',
  'embeddings',
  'settings',
];

// Seedea ≥1 doc en CADA subcolección bajo users/{uid}/ SIN crear el doc raíz
// users/{uid} (queda FANTASMA): recursiveDelete debe borrar las subcolecciones igual.
export async function seedUserSubcollections(uid: string): Promise<void> {
  const e = await getTestEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', uid, 'notes', 'note-1'), { title: 'n', contentPlain: 'x' }),
      setDoc(doc(db, 'users', uid, 'tasks', 'task-1'), { name: 't' }),
      setDoc(doc(db, 'users', uid, 'projects', 'project-1'), { name: 'p' }),
      setDoc(doc(db, 'users', uid, 'objectives', 'objective-1'), { name: 'o' }),
      setDoc(doc(db, 'users', uid, 'inbox', 'inbox-1'), { rawContent: 'r' }),
      setDoc(doc(db, 'users', uid, 'habits', '2026-06-20'), { date: '2026-06-20' }),
      setDoc(doc(db, 'users', uid, 'links', 'a__b'), { sourceId: 'a', targetId: 'b' }),
      setDoc(doc(db, 'users', uid, 'embeddings', 'note-1'), { vector: [0.1] }),
      setDoc(doc(db, 'users', uid, 'settings', 'preferences'), { locale: 'es' }),
      setDoc(doc(db, 'users', uid, 'settings', 'aiKeys'), {
        anthropic: { configured: true, last4: '1234' },
      }),
    ]);
  });
}

export async function seedUserSecret(uid: string): Promise<void> {
  const e = await getTestEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'userSecrets', uid, 'keys', 'anthropic'), {
      ciphertext: 'x',
      iv: 'y',
      authTag: 'z',
      keyVersion: 1,
    });
  });
}

export async function seedRateLimit(uid: string): Promise<void> {
  const e = await getTestEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, 'rateLimits', `${uid}__embedQuery__min__1`), { count: 1 }),
      setDoc(doc(db, 'rateLimits', `${uid}__embedQuery__day__1`), { count: 1 }),
    ]);
  });
}

export async function countUserSubdocs(uid: string): Promise<number> {
  const e = await getTestEnv();
  let total = 0;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const sub of USER_SUBCOLLECTIONS) {
      const snap = await getDocs(collection(db, 'users', uid, sub));
      total += snap.size;
    }
  });
  return total;
}

export async function countUserSecrets(uid: string): Promise<number> {
  const e = await getTestEnv();
  let count = 0;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(collection(ctx.firestore(), 'userSecrets', uid, 'keys'));
    count = snap.size;
  });
  return count;
}

// rateLimits no tiene campo uid (va embebido en el docId) → se filtra por prefijo.
export async function countRateLimitsFor(uid: string): Promise<number> {
  const e = await getTestEnv();
  let count = 0;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(collection(ctx.firestore(), 'rateLimits'));
    count = snap.docs.filter((d) => d.id.startsWith(`${uid}__`)).length;
  });
  return count;
}
