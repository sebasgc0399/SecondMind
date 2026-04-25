import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

// Grace period para notas pre-F19. F18 dejó en producción notas con
// `deletedAt > 0` desde antes de que la papelera existiera; el default
// `trashAutoPurgeDays = 30` haría que el primer cron run de esta CF
// las purgue masivamente sin que el usuario tenga oportunidad de
// revisarlas. La regla es:
//
//   effectiveDeletedAt = max(deletedAt, F19_FIRST_DEPLOY_TS)
//   purge si (now - effectiveDeletedAt) >= purgeDays * 24h
//
// Resultado: notas pre-F19 obtienen un grace period equivalente a
// `trashAutoPurgeDays` desde el deploy, no desde su `deletedAt` real.
//
// Hardcodear con el timestamp del primer deploy de F19. NO modificar
// después del deploy — el comportamiento se vuelve impredecible si se
// edita.
const F19_FIRST_DEPLOY_TS = Date.UTC(2026, 3, 26); // 2026-04-26T00:00:00Z

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PURGE_CHUNK_SIZE = 50;
const CHUNK_DELAY_MS = 200;

type AutoPurgeDays = 0 | 7 | 15 | 30;
const DEFAULT_PURGE_DAYS: AutoPurgeDays = 30;

function parsePurgeDays(value: unknown): AutoPurgeDays {
  if (value === 0 || value === 7 || value === 15 || value === 30) return value;
  return DEFAULT_PURGE_DAYS;
}

// CF scheduled diaria. Recorre todas las notas con `deletedAt > 0` (collection
// group query) y borra las que cumplieron el plazo configurado en
// `users/{uid}/settings/preferences.trashAutoPurgeDays`.
//
// El delete cascadea automáticamente a F3 (onNoteDeleted) que limpia
// embeddings + links bidireccionales.
//
// Schedule: 03:00 UTC = ~00:00 ART (offpeak). Diferencia 30d vs 30d+12h
// es irrelevante para el caso de uso.
//
// Cache de preferences por uid dentro del run: evita N reads del mismo doc
// cuando un user tiene varias notas en papelera. La cache es per-run
// (no se invalida mid-run) — aceptable para cron diario.
export const autoPurgeTrash = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 540,
    retryCount: 0,
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();

    const trashSnap = await db.collectionGroup('notes').where('deletedAt', '>', 0).get();

    const totalScanned = trashSnap.size;
    const prefsCache = new Map<string, AutoPurgeDays>();
    const toDelete: { ref: FirebaseFirestore.DocumentReference; userId: string }[] = [];
    const perUser: Record<string, number> = {};

    for (const doc of trashSnap.docs) {
      const data = doc.data();
      const deletedAt = typeof data.deletedAt === 'number' ? data.deletedAt : 0;
      if (deletedAt <= 0) continue;

      // Path: users/{userId}/notes/{noteId}. parent = notes coll, parent.parent = user doc.
      const userId = doc.ref.parent.parent?.id;
      if (!userId) continue;

      let purgeDays = prefsCache.get(userId);
      if (purgeDays === undefined) {
        const prefSnap = await db.doc(`users/${userId}/settings/preferences`).get();
        purgeDays = prefSnap.exists
          ? parsePurgeDays(prefSnap.data()?.trashAutoPurgeDays)
          : DEFAULT_PURGE_DAYS;
        prefsCache.set(userId, purgeDays);
      }

      // "Nunca": el user optó por no auto-purgar.
      if (purgeDays === 0) continue;

      // Grace period: notas pre-F19 cuentan desde el deploy, no desde su
      // deletedAt real.
      const effectiveDeletedAt = Math.max(deletedAt, F19_FIRST_DEPLOY_TS);
      if (now - effectiveDeletedAt < purgeDays * MS_PER_DAY) continue;

      toDelete.push({ ref: doc.ref, userId });
    }

    // Rate limit: chunks de 50 con 200ms entre chunks. Cada delete dispara
    // F3 (onNoteDeleted) que hace ~3-10 ops adicionales (embedding +
    // links). Sin chunking, un primer run con notas pre-F19 podría
    // saturar quotas de Firestore o disparar cold starts masivos.
    let totalPurged = 0;
    for (let i = 0; i < toDelete.length; i += PURGE_CHUNK_SIZE) {
      const chunk = toDelete.slice(i, i + PURGE_CHUNK_SIZE);
      const results = await Promise.allSettled(chunk.map((item) => item.ref.delete()));
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          totalPurged += 1;
          const userId = chunk[idx]!.userId;
          perUser[userId] = (perUser[userId] ?? 0) + 1;
        } else {
          logger.error('autoPurgeTrash: delete failed', {
            path: chunk[idx]!.ref.path,
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          });
        }
      });
      // Sleep entre chunks (no después del último).
      if (i + PURGE_CHUNK_SIZE < toDelete.length) {
        await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
      }
    }

    logger.info('autoPurgeTrash: ok', {
      totalScanned,
      totalCandidates: toDelete.length,
      totalPurged,
      perUserCount: Object.keys(perUser).length,
      perUser,
    });
  },
);
