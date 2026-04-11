import { useMemo } from 'react';
import { Link } from 'react-router';
import useTasks from '@/hooks/useTasks';
import { isSameDay } from '@/lib/formatDate';
import type { Priority } from '@/types/common';
import type { Task } from '@/types/task';

const PREVIEW_LIMIT = 5;

const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-emerald-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Prioridad baja',
  medium: 'Prioridad media',
  high: 'Prioridad alta',
  urgent: 'Prioridad urgente',
};

export default function TasksTodayCard() {
  const { tasks, isInitializing, completeTask } = useTasks();

  const todayTasks = useMemo<Task[]>(() => {
    const now = Date.now();
    return tasks
      .filter((t) => t.status !== 'completed' && t.dueDate > 0 && isSameDay(t.dueDate, now))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, PREVIEW_LIMIT);
  }, [tasks]);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">✅ Tareas de hoy</h2>
        {todayTasks.length > 0 && (
          <Link
            to="/tasks"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver todas →
          </Link>
        )}
      </header>

      {isInitializing && todayTasks.length === 0 ? (
        <CardSkeleton rows={3} />
      ) : todayTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada para hoy 🎉</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todayTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2"
            >
              <input
                type="checkbox"
                checked={false}
                onChange={() => void completeTask(task.id)}
                className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                aria-label={`Completar ${task.name}`}
              />
              <Link
                to="/tasks"
                className="flex-1 truncate text-sm text-foreground transition-colors hover:text-primary"
              >
                {task.name}
              </Link>
              <span
                className={`shrink-0 h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority]}`}
                aria-label={PRIORITY_LABEL[task.priority]}
                title={PRIORITY_LABEL[task.priority]}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-md border border-border/60 bg-background/40 p-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
