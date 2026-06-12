import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HABITS, type HabitEntry, type HabitKey } from '@/types/habit';
import { addDays } from '@/hooks/useHabits';
import HabitRow from './HabitRow';

interface HabitGridProps {
  weekStart: Date;
  weekEntries: HabitEntry[];
  editableDates: Set<string>;
  todayKey: string;
  todayMs: number;
  onToggle: (dateKey: string, habitKey: HabitKey) => void;
}

export default function HabitGrid({
  weekStart,
  weekEntries,
  editableDates,
  todayKey,
  todayMs,
  onToggle,
}: HabitGridProps) {
  const { t, i18n } = useTranslation();
  // F58: formatter por idioma activo — a module-scope se evaluaría una sola
  // vez al cargar el bundle y congelaría el locale del boot.
  const weekdayFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language || 'es', { weekday: 'narrow' }),
    [i18n.language],
  );
  // Construimos los 7 headers desde weekStart
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 bg-background py-2 pr-3 pl-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('habits.gridHeader', 'Hábito')}
            </th>
            {days.map((d) => {
              const dKey = weekEntries.find((_, idx) => idx === days.indexOf(d))?.id ?? '';
              const isToday = dKey === todayKey;
              const weekday = weekdayFormat.format(d).toUpperCase();
              return (
                <th
                  key={d.toISOString()}
                  className={`px-1 py-2 text-center text-[10px] font-semibold ${
                    isToday ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <div className={isToday ? 'rounded bg-accent/40 py-1' : ''}>
                    <div>{weekday}</div>
                    <div className="mt-0.5 text-[11px] font-normal">{d.getDate()}</div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {HABITS.map((habit) => (
            <HabitRow
              key={habit.key}
              habit={habit}
              weekEntries={weekEntries}
              editableDates={editableDates}
              todayMs={todayMs}
              onToggle={onToggle}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
