// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import HabitRow from '@/components/habits/HabitRow';
import { HABITS, type HabitEntry } from '@/types/habit';
import { initTestI18n } from '@/test/i18n';

const habit = HABITS[0];

function entry(id: string, date: number): HabitEntry {
  const base = Object.fromEntries(HABITS.map((h) => [h.key, false])) as Record<
    (typeof HABITS)[number]['key'],
    boolean
  >;
  return { id, date, ...base, progress: 0, createdAt: 0, updatedAt: 0 };
}

function cellBox(dateKey: string): Element {
  const button = screen.getByRole('button', { name: new RegExp(dateKey) });
  return button.firstElementChild!;
}

describe('HabitRow', () => {
  beforeEach(async () => {
    await initTestI18n();
  });

  it('el día de hoy ya guardado (date a las 12:00) no se marca como futuro', () => {
    // habitsRepo guarda `date` a las 12:00 locales: un timestamp mayor que el inicio de hoy.
    const today = entry('2026-10-02', new Date(2026, 9, 2, 12).getTime());
    const tomorrow = entry('2026-10-03', new Date(2026, 9, 3).getTime());
    render(
      <table>
        <tbody>
          <HabitRow
            habit={habit}
            weekEntries={[today, tomorrow]}
            editableDates={new Set(['2026-10-02'])}
            todayKey="2026-10-02"
            onToggle={() => {}}
          />
        </tbody>
      </table>,
    );
    expect(cellBox('2026-10-02').className).not.toContain('border-dashed');
    expect(cellBox('2026-10-03').className).toContain('border-dashed');
  });
});
