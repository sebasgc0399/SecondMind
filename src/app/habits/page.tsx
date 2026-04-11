import { useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import useHabits, { addDays, formatDateKey, getWeekStart } from '@/hooks/useHabits';
import HabitGrid from '@/components/habits/HabitGrid';
import { HABITS } from '@/types/habit';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function HabitsPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const { weekEntries, isInitializing, toggleHabit } = useHabits(weekStart);

  // Reactive source for "hoy" progress: se recalcula cuando el usuario togglea,
  // aunque esté viendo otra semana.
  const habitsTable = useTable('habits', 'habits');

  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  const todayMs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const editableDates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = addDays(today, -1);
    return new Set([formatDateKey(today), formatDateKey(yesterday)]);
  }, []);

  const todayStats = useMemo(() => {
    const row = habitsTable[todayKey] ?? {};
    const done = HABITS.filter((h) => Boolean(row[h.key])).length;
    return {
      done,
      percent: Math.round((done / HABITS.length) * 100),
    };
  }, [habitsTable, todayKey]);

  const monthYearLabel = useMemo(() => {
    return capitalize(weekStart.toLocaleDateString('es', { month: 'long', year: 'numeric' }));
  }, [weekStart]);

  const goPrevWeek = () => setWeekStart((prev) => addDays(prev, -7));
  const goNextWeek = () => setWeekStart((prev) => addDays(prev, 7));

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Hábitos</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrevWeek}
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-30 text-center text-sm font-medium text-foreground">
            {monthYearLabel}
          </span>
          <button
            type="button"
            onClick={goNextWeek}
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Hoy</span>
          <span>
            {todayStats.done}/{HABITS.length} ({todayStats.percent}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${todayStats.percent}%` }}
          />
        </div>
      </div>

      {isInitializing ? (
        <HabitsSkeleton />
      ) : (
        <div className="rounded-lg border border-border bg-card p-4">
          <HabitGrid
            weekStart={weekStart}
            weekEntries={weekEntries}
            editableDates={editableDates}
            todayKey={todayKey}
            todayMs={todayMs}
            onToggle={(dateKey, habitKey) => void toggleHabit(dateKey, habitKey)}
          />
        </div>
      )}
    </div>
  );
}

function HabitsSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex gap-2">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-4 w-7 animate-pulse rounded bg-muted" />
        ))}
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="mb-2 flex items-center gap-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="flex-1" />
          {[0, 1, 2, 3, 4, 5, 6].map((j) => (
            <div key={j} className="h-7 w-7 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}
