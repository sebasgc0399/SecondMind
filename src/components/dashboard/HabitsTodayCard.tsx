import { useMemo } from 'react';
import { Link } from 'react-router';
import useHabits, { formatDateKey, getWeekStart } from '@/hooks/useHabits';
import { HABITS } from '@/types/habit';

export default function HabitsTodayCard() {
  const weekStart = useMemo(() => getWeekStart(new Date()), []);
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const { weekEntries, isInitializing, toggleHabit } = useHabits(weekStart);

  const todayEntry = weekEntries.find((e) => e.id === todayKey);

  const doneCount = todayEntry ? HABITS.filter((h) => todayEntry[h.key]).length : 0;
  const percent = Math.round((doneCount / HABITS.length) * 100);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">☑️ Hábitos de hoy</h2>
        <Link
          to="/habits"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver semana →
        </Link>
      </header>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Progreso</span>
          <span>
            {doneCount}/{HABITS.length} ({percent}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {isInitializing ? (
        <div className="flex flex-wrap gap-2">
          {HABITS.map((h) => (
            <div
              key={h.key}
              className="h-7 w-24 animate-pulse rounded-full bg-muted"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {HABITS.map((h) => {
            const isDone = todayEntry ? Boolean(todayEntry[h.key]) : false;
            return (
              <button
                key={h.key}
                type="button"
                onClick={() => void toggleHabit(todayKey, h.key)}
                aria-pressed={isDone}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  isDone
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted text-muted-foreground hover:bg-accent/60'
                }`}
                title={h.label}
              >
                {h.emoji} {h.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
