import { createFirestoreRepo, type RepoRow } from '@/infra/repos/baseRepo';
import { habitsStore } from '@/stores/habitsStore';
import { HABITS, type HabitKey } from '@/types/habit';

// Schema del row en TinyBase/Firestore — doc por día, IDs YYYY-MM-DD
// (ver habitsStore.ts). setPartialRow sobre un id inexistente crea la row
// con defaults del schema, por eso toggleHabit puede usar update() para
// ambos casos (create al primer toggle del día + update en siguientes).
interface HabitRow extends RepoRow {
  date: number;
  ejercicio: boolean;
  codear: boolean;
  leer: boolean;
  meditar: boolean;
  comerBien: boolean;
  tomarAgua: boolean;
  planificarDia: boolean;
  madrugar: boolean;
  gratitud: boolean;
  ingles: boolean;
  pareja: boolean;
  estirar: boolean;
  tenderCama: boolean;
  noComerDulce: boolean;
  progress: number;
  createdAt: number;
  updatedAt: number;
}

const repo = createFirestoreRepo<HabitRow>({
  store: habitsStore,
  table: 'habits',
  pathFor: (uid, id) => `users/${uid}/habits/${id}`,
});

/**
 * Calcula el progress (0-100) aplicando el flip al habitKey sobre el row actual.
 * Pura — testeable aislada si algún día surge necesidad.
 */
function computeNextProgress(
  existingRow: Record<string, unknown>,
  habitKey: HabitKey,
  nextValue: boolean,
): number {
  const nextTrueCount = HABITS.filter((h) => {
    if (h.key === habitKey) return nextValue;
    return Boolean(existingRow[h.key]);
  }).length;
  return Math.round((nextTrueCount / HABITS.length) * 100);
}

async function toggleHabit(dateKey: string, habitKey: HabitKey): Promise<void> {
  const now = Date.now();
  const existingRow = habitsStore.getRow('habits', dateKey);
  const hasExisting = Object.keys(existingRow).length > 0;
  const currentValue = Boolean(existingRow[habitKey]);
  const nextValue = !currentValue;
  const progress = computeNextProgress(existingRow, habitKey, nextValue);

  const partial: Partial<HabitRow> = {
    [habitKey]: nextValue,
    progress,
    updatedAt: now,
  };

  // Si es una row nueva, agregar createdAt + date (parseado del dateKey).
  // Patrón "doc creado implícitamente al primer toggle" (gotcha ESTADO-ACTUAL).
  if (!hasExisting) {
    const [yearStr, monthStr, dayStr] = dateKey.split('-');
    partial.date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr)).setHours(
      12,
      0,
      0,
      0,
    );
    partial.createdAt = now;
  }

  try {
    await repo.update(dateKey, partial);
  } catch (error) {
    console.error('[habitsRepo] toggleHabit failed', error);
  }
}

export const habitsRepo = { toggleHabit };
