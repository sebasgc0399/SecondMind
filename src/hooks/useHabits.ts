import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { habitsStore } from '@/stores/habitsStore';
import useAuth from '@/hooks/useAuth';
import { HABITS, type HabitEntry, type HabitKey } from '@/types/habit';

const INIT_GRACE_MS = 200;

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Lunes = inicio de semana. Si el día es domingo (getDay() === 0), retrocede 6 días.
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diff);
  return d;
}

function synthesizeEmptyEntry(date: Date): HabitEntry {
  return {
    id: formatDateKey(date),
    date: date.getTime(),
    ejercicio: false,
    codear: false,
    leer: false,
    meditar: false,
    comerBien: false,
    tomarAgua: false,
    planificarDia: false,
    madrugar: false,
    gratitud: false,
    ingles: false,
    pareja: false,
    estirar: false,
    tenderCama: false,
    noComerDulce: false,
    progress: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

function rowToEntry(id: string, row: Record<string, unknown>): HabitEntry {
  return {
    id,
    date: Number(row.date) || 0,
    ejercicio: Boolean(row.ejercicio),
    codear: Boolean(row.codear),
    leer: Boolean(row.leer),
    meditar: Boolean(row.meditar),
    comerBien: Boolean(row.comerBien),
    tomarAgua: Boolean(row.tomarAgua),
    planificarDia: Boolean(row.planificarDia),
    madrugar: Boolean(row.madrugar),
    gratitud: Boolean(row.gratitud),
    ingles: Boolean(row.ingles),
    pareja: Boolean(row.pareja),
    estirar: Boolean(row.estirar),
    tenderCama: Boolean(row.tenderCama),
    noComerDulce: Boolean(row.noComerDulce),
    progress: Number(row.progress) || 0,
    createdAt: Number(row.createdAt) || 0,
    updatedAt: Number(row.updatedAt) || 0,
  };
}

interface UseHabitsReturn {
  weekEntries: HabitEntry[];
  isInitializing: boolean;
  toggleHabit: (dateKey: string, habitKey: HabitKey) => Promise<void>;
}

export default function useHabits(weekStart: Date): UseHabitsReturn {
  const { user } = useAuth();
  const table = useTable('habits', 'habits');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsInitializing(false), INIT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const weekEntries = useMemo<HabitEntry[]>(() => {
    const out: HabitEntry[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(weekStart, i);
      const key = formatDateKey(d);
      const row = table[key];
      if (row) {
        out.push(rowToEntry(key, row as Record<string, unknown>));
      } else {
        out.push(synthesizeEmptyEntry(d));
      }
    }
    return out;
  }, [table, weekStart]);

  const toggleHabit = useCallback(
    async (dateKey: string, habitKey: HabitKey): Promise<void> => {
      if (!user) return;
      const now = Date.now();

      // Leer estado actual del store (sync, in-memory).
      const existingRow = habitsStore.getRow('habits', dateKey);
      const hasExisting = Object.keys(existingRow).length > 0;
      const currentValue = Boolean(existingRow[habitKey]);
      const nextValue = !currentValue;

      // Recontar los 14 booleans aplicando el flip.
      const nextTrueCount = HABITS.filter((h) => {
        if (h.key === habitKey) return nextValue;
        return Boolean(existingRow[h.key]);
      }).length;
      const progress = Math.round((nextTrueCount / HABITS.length) * 100);

      // Partial update: solo el field flipado + progress + updatedAt.
      // Esto es commutative: dos toggles rápidos de hábitos distintos no se
      // pisan, porque cada uno solo toca su propia celda + progress
      // (progress puede pisarse pero se recalcula correctamente al próximo
      // toggle porque leemos el row actualizado del store).
      const partial: Record<string, string | number | boolean> = {
        [habitKey]: nextValue,
        progress,
        updatedAt: now,
      };

      // Si es una row nueva, agregar createdAt y date (parseado del dateKey).
      if (!hasExisting) {
        const [yearStr, monthStr, dayStr] = dateKey.split('-');
        const dateMs = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr)).setHours(
          12,
          0,
          0,
          0,
        );
        partial.date = dateMs;
        partial.createdAt = now;
      }

      // CRÍTICO: aplicar local FIRST (sync), Firestore DESPUÉS (async).
      // Si se invierte, dos toggles rápidos (click 1 + click 2 antes de que
      // resuelva el setDoc de click 1) hacen race y el segundo pisa el
      // primero porque lee existingRow stale.
      habitsStore.setPartialRow('habits', dateKey, partial);

      try {
        await setDoc(doc(db, 'users', user.uid, 'habits', dateKey), partial, { merge: true });
      } catch (error) {
        console.error('[useHabits] toggleHabit failed', error);
      }
    },
    [user],
  );

  return { weekEntries, isInitializing, toggleHabit };
}
