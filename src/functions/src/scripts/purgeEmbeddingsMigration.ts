import * as admin from 'firebase-admin';
import { deleteAllUserEmbeddings } from '../embeddings/deleteUserEmbeddings';

// SPEC-66 F8 (D3-M-C) — migración ONE-TIME: purga los embeddings de los usuarios
// EXISTENTES generados ANTES del toggle, que nunca dieron el reconocimiento
// afirmativo que exige §7.1. El doc de consentimiento está AUSENTE para todos
// (feature nueva) → ya están en estado inerte (enabled=false); esta migración
// solo BORRA los vectores pre-existentes para que no quede ningún embedding sin
// consentimiento fresco. Al re-reconocer, el backfill (F6) los regenera.
//
// Reusa deleteAllUserEmbeddings (F7) — UNA sola lógica de borrado, sin duplicar.
//
// ⚠️ PENDIENTE DE CONFIRMACIÓN LEGAL (D3-M-C). NO disparar contra prod hasta el
// visto bueno del abogado: es destructivo sobre datos reales con peso legal.
// Probar en EMULADOR. Contra prod, solo tras OK legal y bajo el protocolo de QA
// de CLAUDE.md step 5 (anunciar + verificar), corriendo PRIMERO con dryRun=true.
//
// Cómo correrlo (cuando se autorice), con ADC (NUNCA una SA key commiteada):
//   gcloud auth application-default login   # proyecto secondmindv1
//   # build de functions, luego un runner mínimo:
//   node -e "const a=require('firebase-admin');a.initializeApp();
//     require('./lib/scripts/purgeEmbeddingsMigration')
//       .purgeAllUsersEmbeddings(true).then(r=>{console.log(r);process.exit(0)})"
//   # dryRun=true imprime el alcance; cambiar a false para ejecutar.
export interface PurgeMigrationResult {
  usersScanned: number;
  usersWithEmbeddings: number;
  embeddingsDeleted: number; // en dryRun: cuántos SE borrarían
  dryRun: boolean;
}

export async function purgeAllUsersEmbeddings(dryRun: boolean): Promise<PurgeMigrationResult> {
  const db = admin.firestore();
  // listDocuments() devuelve refs incluso para los "ghost docs" users/{uid} (que
  // no existen como documento pero cuelgan subcolecciones).
  const userRefs = await db.collection('users').listDocuments();

  let usersWithEmbeddings = 0;
  let embeddingsDeleted = 0;

  for (const userRef of userRefs) {
    const uid = userRef.id;
    if (dryRun) {
      const snap = await db.collection(`users/${uid}/embeddings`).get();
      if (snap.size > 0) {
        usersWithEmbeddings += 1;
        embeddingsDeleted += snap.size;
      }
    } else {
      const deleted = await deleteAllUserEmbeddings(uid);
      if (deleted > 0) {
        usersWithEmbeddings += 1;
        embeddingsDeleted += deleted;
      }
    }
  }

  return { usersScanned: userRefs.length, usersWithEmbeddings, embeddingsDeleted, dryRun };
}
