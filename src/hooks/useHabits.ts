import { useEffect, useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { habitsRepo } from '@/infra/repos/habitsRepo';
import { type HabitEntry, type HabitKey } from '@/types/habit';

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
  const dayOfWeek = d.getDay();
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

  return { weekEntries, isInitializing, toggleHabit: habitsRepo.toggleHabit };
}
