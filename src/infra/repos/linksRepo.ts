import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createFirestoreRepo } from '@/infra/repos/baseRepo';
import { linksStore } from '@/stores/linksStore';
import type { LinkRow } from '@/types/repoRows';

const repo = createFirestoreRepo<LinkRow>({
  store: linksStore,
  table: 'links',
  pathFor: (uid, id) => `users/${uid}/links/${id}`,
  // Sin queue F29: el caller useNoteSave ya tiene retry path via pendingRef.
  // Si emerge necesidad de retry offline para links, F-future.
});

// linkId determinístico: garantiza que un par (source, target) tenga un
// único documento en la colección. Sin este formato necesitaríamos
// query where-by para dedupear.
export function buildLinkId(sourceId: string, targetId: string): string {
  return `${sourceId}__${targetId}`;
}

export interface LinkSyncCreate {
  targetId: string;
  targetTitle: string;
  context?: string;
}

export interface SyncLinksInput {
  sourceId: string;
  sourceTitle: string;
  userId: string;
  toCreate: LinkSyncCreate[];
  toDeleteIds: string[];
}

/**
 * Sincroniza links del editor en batch. Promise.all paralelo de creates
 * + deletes; preserva el comportamiento pre-F38.1 (zero behavior change).
 *
 * NO toca linksStore — el persister F12 propaga el delta desde Firestore
 * via onSnapshot. La actualización de `incomingLinkIds` en notes la hace
 * el orquestador (src/infra/syncLinksFromEditor.ts) post-await; ese campo
 * es derivado del state de links (espejo bidireccional) y la mutation
 * directa al store es intencional para evitar write amplification.
 */
async function syncLinks(input: SyncLinksInput): Promise<void> {
  const nowMs = Date.now();

  await Promise.all([
    ...input.toCreate.map((link) => {
      const id = buildLinkId(input.sourceId, link.targetId);
      return setDoc(doc(db, `users/${input.userId}/links/${id}`), {
        sourceId: input.sourceId,
        targetId: link.targetId,
        sourceTitle: input.sourceTitle,
        targetTitle: link.targetTitle,
        context: link.context ?? '',
        linkType: 'explicit',
        strength: 0,
        accepted: true,
        createdAt: nowMs,
      });
    }),
    ...input.toDeleteIds.map((linkId) =>
      deleteDoc(doc(db, `users/${input.userId}/links/${linkId}`)),
    ),
  ]);
}

export const linksRepo = {
  syncLinks,
  // Factory CRUD expuesto para casos futuros y dev tools. Hoy no hay
  // callers; mantener el shape estándar (paridad con notesRepo, tasksRepo,
  // etc.) facilita extensión sin tocar el módulo.
  create: repo.create,
  update: repo.update,
  remove: repo.remove,
  removeRaw: repo.removeRaw,
};
