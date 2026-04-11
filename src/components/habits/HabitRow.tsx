import type { HabitEntry, HabitKey, HABITS } from '@/types/habit';

interface HabitRowProps {
  habit: (typeof HABITS)[number];
  weekEntries: HabitEntry[];
  editableDates: Set<string>;
  todayMs: number; // inicio del día de hoy, para detectar futuro
  onToggle: (dateKey: string, habitKey: HabitKey) => void;
}

export default function HabitRow({
  habit,
  weekEntries,
  editableDates,
  todayMs,
  onToggle,
}: HabitRowProps) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2 pr-3 text-sm text-foreground">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true">{habit.emoji}</span>
          <span>{habit.label}</span>
        </span>
      </td>
      {weekEntries.map((entry) => {
        const isDone = entry[habit.key];
        const isEditable = editableDates.has(entry.id);
        const isFuture = entry.date > todayMs;

        let cellClass = 'h-7 w-7 rounded border transition-colors';
        if (isDone) {
          cellClass += ' bg-primary border-primary';
        } else if (isFuture) {
          cellClass += ' bg-transparent border-dashed border-border';
        } else if (isEditable) {
          cellClass += ' bg-muted border-border hover:bg-accent/60';
        } else {
          cellClass += ' bg-muted/50 border-border opacity-60';
        }

        if (!isEditable) {
          cellClass += ' cursor-not-allowed';
        } else {
          cellClass += ' cursor-pointer';
        }

        return (
          <td key={entry.id} className="px-1 py-2 text-center">
            <button
              type="button"
              disabled={!isEditable}
              onClick={() => onToggle(entry.id, habit.key)}
              className={cellClass}
              aria-label={`${habit.label} — ${entry.id}`}
              aria-pressed={isDone}
              title={`${habit.label} · ${entry.id}`}
            />
          </td>
        );
      })}
    </tr>
  );
}
