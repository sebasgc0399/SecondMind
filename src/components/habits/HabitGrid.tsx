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

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('es', { weekday: 'narrow' });

export default function HabitGrid({
  weekStart,
  weekEntries,
  editableDates,
  todayKey,
  todayMs,
  onToggle,
}: HabitGridProps) {
  // Construimos los 7 headers desde weekStart
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Hábito
            </th>
            {days.map((d) => {
              const dKey = weekEntries.find((_, idx) => idx === days.indexOf(d))?.id ?? '';
              const isToday = dKey === todayKey;
              const weekday = WEEKDAY_FORMAT.format(d).toUpperCase();
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
