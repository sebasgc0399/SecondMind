import { useHabitLabels } from '@/lib/entityLabels';
import type { HabitEntry, HabitKey, HABITS } from '@/types/habit';

interface HabitRowProps {
  habit: (typeof HABITS)[number];
  weekEntries: HabitEntry[];
  editableDates: Set<string>;
  todayKey: string; // YYYY-MM-DD de hoy, para detectar futuro
  onToggle: (dateKey: string, habitKey: HabitKey) => void;
}

export default function HabitRow({
  habit,
  weekEntries,
  editableDates,
  todayKey,
  onToggle,
}: HabitRowProps) {
  const habitLabels = useHabitLabels();
  const label = habitLabels[habit.key];
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="sticky left-0 z-10 bg-background py-2 pr-3 pl-2 text-sm text-foreground">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true">{habit.emoji}</span>
          <span>{label}</span>
        </span>
      </td>
      {weekEntries.map((entry) => {
        const isDone = entry[habit.key];
        const isEditable = editableDates.has(entry.id);
        // Por clave y no por timestamp: las rows guardadas tienen `date` a las 12:00 locales
        // (habitsRepo) y las sintetizadas a las 00:00; comparar contra el inicio de hoy
        // marcaba como futuro el día de hoy ya guardado. YYYY-MM-DD ordena lexicográficamente.
        const isFuture = entry.id > todayKey;

        let visualClass = 'block h-7 w-7 rounded border transition-colors';
        if (isDone) {
          visualClass += ' bg-primary border-primary';
        } else if (isFuture) {
          visualClass += ' bg-transparent border-dashed border-border';
        } else if (isEditable) {
          visualClass += ' bg-muted border-border';
        } else {
          visualClass += ' bg-muted/50 border-border opacity-60';
        }

        return (
          <td key={entry.id} className="p-0 text-center">
            <button
              type="button"
              disabled={!isEditable}
              onClick={() => onToggle(entry.id, habit.key)}
              className={`flex h-11 w-11 min-w-11 items-center justify-center ${
                isEditable ? 'cursor-pointer hover:bg-accent/40' : 'cursor-not-allowed'
              }`}
              aria-label={`${label} — ${entry.id}`}
              aria-pressed={isDone}
              title={`${label} · ${entry.id}`}
            >
              <span className={visualClass} />
            </button>
          </td>
        );
      })}
    </tr>
  );
}
