import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { linksStore } from '@/stores/linksStore';
import { notesStore } from '@/stores/notesStore';
import { parseIds, stringifyIds } from '@/lib/tinybase';
import type { ExtractedLink } from '@/lib/editor/extractLinks';

export interface SyncLinksInput {
  sourceId: string;
  sourceTitle: string;
  userId: string;
  newLinks: ExtractedLink[];
}

export interface SyncLinksResult {
  outgoingLinkIds: string[];
  linkCount: number;
}

// linkId determinístico: garantiza que un par (source, target) tenga un
// único documento en la colección links/. Sin este formato necesitaríamos
// query where-by para dedupear.
function buildLinkId(sourceId: string, targetId: string): string {
  return `${sourceId}__${targetId}`;
}

// Sincroniza los wikilinks extraídos del editor con la colección links/
// y actualiza los incomingLinkIds de los targets afectados en TinyBase.
// Se llama desde useNoteSave después del updateDoc del content.
export async function syncLinks({
  sourceId,
  sourceTitle,
  userId,
  newLinks,
}: SyncLinksInput): Promise<SyncLinksResult> {
  // 1. Filtrar self-links: una nota no puede linkearse a sí misma.
  const filteredLinks = newLinks.filter((link) => link.targetId !== sourceId);

  // 2. Dedupear por targetId (dos [[X]] en el mismo doc → un solo link)
  const newByTarget = new Map<string, ExtractedLink>();
  for (const link of filteredLinks) {
    if (!newByTarget.has(link.targetId)) {
      newByTarget.set(link.targetId, link);
    }
  }
  const newTargetIds = new Set(newByTarget.keys());

  // 3. Leer oldLinks desde linksStore (TinyBase, ya sincronizado con Firestore)
  const linksTable = linksStore.getTable('links');
  const oldLinkEntries = Object.entries(linksTable).filter(([, row]) => row.sourceId === sourceId);
  const oldTargetIds = new Set(oldLinkEntries.map(([, row]) => row.targetId as string));

  // 4. Calcular diff
  const toCreate: ExtractedLink[] = [];
  const toDelete: Array<{ docId: string; targetId: string }> = [];

  for (const [docId, row] of oldLinkEntries) {
    const targetId = row.targetId as string;
    if (!newTargetIds.has(targetId)) {
      toDelete.push({ docId, targetId });
    }
  }
  for (const [targetId, link] of newByTarget.entries()) {
    if (!oldTargetIds.has(targetId)) {
      toCreate.push(link);
    }
  }

  // 5. Ejecutar writes en paralelo
  const col = `users/${userId}/links`;
  const nowMs = Date.now();

  await Promise.all([
    ...toCreate.map((link) => {
      const id = buildLinkId(sourceId, link.targetId);
      return setDoc(doc(db, col, id), {
        sourceId,
        targetId: link.targetId,
        sourceTitle,
        targetTitle: link.targetTitle,
        context: link.context,
        linkType: 'explicit',
        strength: 0,
        accepted: true,
        createdAt: nowMs,
      });
    }),
    ...toDelete.map(({ docId }) => deleteDoc(doc(db, col, docId))),
  ]);

  // 6. Actualizar incomingLinkIds de targets afectados (creates + deletes)
  const affectedTargets = new Set<string>();
  for (const link of toCreate) affectedTargets.add(link.targetId);
  for (const { targetId } of toDelete) affectedTargets.add(targetId);

  for (const targetId of affectedTargets) {
    if (!targetId) continue;
    const targetRow = notesStore.getRow('notes', targetId);
    if (!targetRow || Object.keys(targetRow).length === 0) continue;

    const incoming = parseIds(targetRow.incomingLinkIds as string | undefined);
    const shouldHaveIncoming = newByTarget.has(targetId);
    const nextIncoming = shouldHaveIncoming
      ? Array.from(new Set([...incoming, sourceId]))
      : incoming.filter((id) => id !== sourceId);

    if (sameIdSet(incoming, nextIncoming)) continue;
    notesStore.setPartialRow('notes', targetId, {
      incomingLinkIds: stringifyIds(nextIncoming),
    });
  }

  const outgoingLinkIds = Array.from(newTargetIds);
  return {
    outgoingLinkIds,
    linkCount: outgoingLinkIds.length,
  };
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const item of b) if (!sa.has(item)) return false;
  return true;
}
