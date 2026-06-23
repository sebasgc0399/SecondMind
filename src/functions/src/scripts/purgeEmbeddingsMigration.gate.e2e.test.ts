import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { purgeAllUsersEmbeddings } from './purgeEmbeddingsMigration';

// SPEC-66 F8 (D3-M-C) — migración one-time de purga. INFRA SOLO: el disparo
// contra prod espera confirmación legal. Acá probamos la lógica contra el
// emulador: dryRun reporta sin borrar; ejecutar borra TODOS los embeddings y deja
// las notas. El emulador e2e es compartido entre archivos → limpiamos el estado
// global de embeddings en beforeEach para conteos deterministas.

const U1 = 'mig-user-1';
const U2 = 'mig-user-2';
const U3 = 'mig-user-3'; // usuario sin embeddings

describe('purgeAllUsersEmbeddings — migración (SPEC-66 F8)', () => {
  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: 'demo-secondmind' });
  });

  beforeEach(async () => {
    const db = getFirestore();
    // Limpiar embeddings de TODOS los usuarios (otros archivos e2e dejan residuo)
    // para que los conteos del test sean deterministas, y mis usuarios por completo.
    await purgeAllUsersEmbeddings(false);
    await Promise.all([U1, U2, U3].map((u) => db.recursiveDelete(db.doc(`users/${u}`))));
  });

  it('dryRun=true → reporta el alcance SIN borrar', async () => {
    const db = getFirestore();
    await db.doc(`users/${U1}/embeddings/n1`).set({ vector: [1] });
    await db.doc(`users/${U1}/embeddings/n2`).set({ vector: [2] });
    await db.doc(`users/${U2}/embeddings/n1`).set({ vector: [3] });
    await db.doc(`users/${U3}/notes/n1`).set({ title: 'sin embedding' });

    const res = await purgeAllUsersEmbeddings(true);

    expect(res.dryRun).toBe(true);
    expect(res.usersWithEmbeddings).toBe(2);
    expect(res.embeddingsDeleted).toBe(3);
    // NO borró nada
    expect((await db.collection(`users/${U1}/embeddings`).get()).size).toBe(2);
    expect((await db.collection(`users/${U2}/embeddings`).get()).size).toBe(1);
  });

  it('dryRun=false → borra los embeddings de todos los usuarios, deja las notas intactas', async () => {
    const db = getFirestore();
    await db.doc(`users/${U1}/embeddings/n1`).set({ vector: [1] });
    await db.doc(`users/${U2}/embeddings/n1`).set({ vector: [2] });
    await db.doc(`users/${U1}/notes/n1`).set({ title: 'no tocar' });

    const res = await purgeAllUsersEmbeddings(false);

    expect(res.dryRun).toBe(false);
    expect(res.embeddingsDeleted).toBe(2);
    expect((await db.collection(`users/${U1}/embeddings`).get()).empty).toBe(true);
    expect((await db.collection(`users/${U2}/embeddings`).get()).empty).toBe(true);
    // las notas quedan intactas (la migración solo toca embeddings/)
    expect((await db.collection(`users/${U1}/notes`).get()).size).toBe(1);
  });
});
