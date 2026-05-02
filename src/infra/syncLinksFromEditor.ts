import type { ExtractedLink } from '@/lib/editor/extractLinks';
import { linksRepo } from '@/infra/repos/linksRepo';
import { linksStore } from '@/stores/linksStore';
import { notesStore } from '@/stores/notesStore';
import { parseIds, stringifyIds } from '@/lib/tinybase';

export interface SyncLinksFromEditorInput {
  sourceId: string;
  sourceTitle: string;
  userId: string;
  newLinks: ExtractedLink[];
}

export interface SyncLinksFromEditorResult {
  outgoingLinkIds: string[];
  linkCount: number;
}

export interface OldLinkEntry {
  docId: string;
  targetId: string;
}

export interface LinksDiff {
  toCreate: { targetId: string; targetTitle: string; context?: string }[];
  toDeleteIds: string[];
  affectedTargetIds: string[];
  newTargetIds: Set<string>;
}

/**
 * Función pura: calcula el diff entre los links extraídos del editor y los
 * old links existentes para sourceId. Filtra self-links y dedupea por
 * targetId. Exportada separadamente para test sin mocks.
 */
export function computeLinksDiff(
  newLinks: ExtractedLink[],
  oldLinks: OldLinkEntry[],
  sourceId: string,
): LinksDiff {
  const newByTarget = new Map<string, ExtractedLink>();
  for (const link of newLinks) {
    if (link.targetId === sourceId) continue;
    if (newByTarget.has(link.targetId)) continue;
    newByTarget.set(link.targetId, link);
  }
  const newTargetIds = new Set(newByTarget.keys());
  const oldTargetIds = new Set(oldLinks.map((entry) => entry.targetId));

  const toDeleteIds: string[] = [];
  for (const { docId, targetId } of oldLinks) {
    if (!newTargetIds.has(targetId)) {
      toDeleteIds.push(docId);
    }
  }

  const toCreate: { targetId: string; targetTitle: string; context?: string }[] = [];
  for (const [targetId, link] of newByTarget.entries()) {
    if (!oldTargetIds.has(targetId)) {
      toCreate.push({
        targetId,
        targetTitle: link.targetTitle,
        context: link.context,
      });
    }
  }

  const affectedTargets = new Set<string>();
  for (const link of toCreate) affectedTargets.add(link.targetId);
  for (const { targetId } of oldLinks) {
    if (!newTargetIds.has(targetId)) affectedTargets.add(targetId);
  }

  return {
    toCreate,
    toDeleteIds,
    affectedTargetIds: Array.from(affectedTargets),
    newTargetIds,
  };
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const item of b) if (!sa.has(item)) return false;
  return true;
}

/**
 * Orquestador cross-entity F38.1 — porta el flow de syncLinks pre-F38.1
 * desde src/lib/editor/syncLinks.ts a capa 3.
 *
 * Flow:
 *   1. Lee oldLinks desde linksStore filtrados por sourceId.
 *   2. Calcula diff puro (computeLinksDiff).
 *   3. await linksRepo.syncLinks(diff) — Firestore writes paralelos.
 *   4. Loop affectedTargetIds: notesStore.setPartialRow para incomingLinkIds.
 *
 * El paso 4 toca notesStore directo (NO notesRepo.updateMeta) porque
 * incomingLinkIds es derivado del state de links (espejo bidireccional);
 * el persister F12 propaga eventualmente. Replicar setDoc explícito por
 * target afectado sería write amplification innecesaria.
 *
 * Orden Firestore-first / TinyBase-second preservado pre-F38.1: useBacklinks
 * lee linksTable + notesTable reactivo y mantiene el mismo frame intermedio
 * pre-existente; F38.1 no introduce uno nuevo.
 */
export async function syncLinksFromEditor(
  input: SyncLinksFromEditorInput,
): Promise<SyncLinksFromEditorResult> {
  const linksTable = linksStore.getTable('links');
  const oldLinks: OldLinkEntry[] = [];
  for (const [docId, row] of Object.entries(linksTable)) {
    if (row.sourceId === input.sourceId) {
      oldLinks.push({ docId, targetId: row.targetId as string });
    }
  }

  const diff = computeLinksDiff(input.newLinks, oldLinks, input.sourceId);

  await linksRepo.syncLinks({
    sourceId: input.sourceId,
    sourceTitle: input.sourceTitle,
    userId: input.userId,
    toCreate: diff.toCreate,
    toDeleteIds: diff.toDeleteIds,
  });

  for (const targetId of diff.affectedTargetIds) {
    if (!targetId) continue;
    const targetRow = notesStore.getRow('notes', targetId);
    if (!targetRow || Object.keys(targetRow).length === 0) continue;

    const incoming = parseIds(targetRow.incomingLinkIds as string | undefined);
    const shouldHaveIncoming = diff.newTargetIds.has(targetId);
    const nextIncoming = shouldHaveIncoming
      ? Array.from(new Set([...incoming, input.sourceId]))
      : incoming.filter((id) => id !== input.sourceId);

    if (sameIdSet(incoming, nextIncoming)) continue;
    notesStore.setPartialRow('notes', targetId, {
      incomingLinkIds: stringifyIds(nextIncoming),
    });
  }

  const outgoingLinkIds = Array.from(diff.newTargetIds);
  return {
    outgoingLinkIds,
    linkCount: outgoingLinkIds.length,
  };
}
