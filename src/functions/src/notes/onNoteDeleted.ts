import * as admin from 'firebase-admin';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

// Cleanup en cascada cuando una nota se borra permanentemente (hard delete
// desde notesRepo.hardDelete o purgeAll, o desde la CF scheduled F4).
//
// Borra:
// 1. El doc de embedding asociado (`users/{uid}/embeddings/{noteId}`).
// 2. Todos los links bidireccionales donde la nota es source o target
//    (`users/{uid}/links/`).
//
// NO reescribe wikilinks dentro del contenido TipTap de OTRAS notas que
// mencionaban a esta — comportamiento estándar de wiki-style systems
// (Obsidian, Roam). El usuario verá un link sin destino y podrá limpiarlo
// manualmente. F19 limpia la representación estructurada (tabla `links/`)
// que alimenta backlinks/grafo, no el markdown del cuerpo.
export const onNoteDeleted = onDocumentDeleted(
  {
    document: 'users/{userId}/notes/{noteId}',
    region: 'us-central1',
    timeoutSeconds: 60,
    retry: false,
  },
  async (event) => {
    const { userId, noteId } = event.params;
    const db = admin.firestore();

    const embeddingRef = db.doc(`users/${userId}/embeddings/${noteId}`);
    const linksColl = db.collection(`users/${userId}/links`);

    // Las dos queries de links no se pueden combinar en una sola con OR sin
    // compound index — se ejecutan en paralelo y los IDs resultantes se
    // mergean en un Set (idempotencia ante el caso edge sourceId == targetId).
    const [embeddingSnap, sourceSnap, targetSnap] = await Promise.all([
      embeddingRef.get(),
      linksColl.where('sourceId', '==', noteId).get(),
      linksColl.where('targetId', '==', noteId).get(),
    ]);

    const linkIds = new Set<string>();
    sourceSnap.docs.forEach((d) => linkIds.add(d.id));
    targetSnap.docs.forEach((d) => linkIds.add(d.id));

    // WriteBatch tiene límite de 500 ops — chunkear si es necesario. Para
    // notas con N>500 links la limpieza se serializa en batches sucesivos.
    const linkIdsArr = Array.from(linkIds);
    const BATCH_LIMIT = 500;
    let embeddingDeleted = false;

    for (let i = 0; i < linkIdsArr.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      const chunk = linkIdsArr.slice(i, i + BATCH_LIMIT);
      chunk.forEach((id) => batch.delete(linksColl.doc(id)));
      // Aprovechamos el primer batch para incluir el embedding (cabe).
      if (i === 0 && embeddingSnap.exists) {
        batch.delete(embeddingRef);
        embeddingDeleted = true;
      }
      await batch.commit();
    }

    // Si no hubo links pero sí embedding, el embedding queda fuera del loop
    // — borrarlo en una operación standalone.
    if (linkIdsArr.length === 0 && embeddingSnap.exists) {
      await embeddingRef.delete();
      embeddingDeleted = true;
    }

    logger.info('onNoteDeleted: ok', {
      userId,
      noteId,
      embeddingDeleted,
      linksDeleted: linkIdsArr.length,
    });
  },
);
