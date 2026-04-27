import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { MoreHorizontal, ChevronUp } from 'lucide-react';
import { formatRelative } from '@/lib/formatDate';
import type { Task } from '@/types/task';
import type { Priority } from '@/types/common';

interface ProjectOption {
  id: string;
  name: string;
}

interface TaskCardProps {
  task: Task;
  projectName?: string;
  projectOptions: ProjectOption[];
  onToggleComplete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  medium: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  urgent: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

function toDateInputValue(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string): number {
  if (!value) return 0;
  const parts = value.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) return 0;
  const d = new Date(year, month - 1, day);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

export default function TaskCard({
  task,
  projectName,
  projectOptions,
  onToggleComplete,
  onUpdate,
}: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description);

  const isCompleted = task.status === 'completed';

  const handleDescriptionBlur = () => {
    if (descDraft !== task.description) {
      onUpdate(task.id, { description: descDraft });
    }
  };

  const handlePriorityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onUpdate(task.id, { priority: e.target.value as Priority });
  };

  const handleProjectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onUpdate(task.id, { projectId: e.target.value });
  };

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    onUpdate(task.id, { dueDate: fromDateInputValue(e.target.value) });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80">
      <div className="flex items-start gap-2">
        <label
          className="-my-2 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
          aria-label={isCompleted ? 'Marcar pendiente' : 'Completar tarea'}
        >
          <input
            type="checkbox"
            checked={isCompleted}
            onChange={() => onToggleComplete(task.id)}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
        </label>
        <div className="mt-1.5 flex-1 min-w-0">
          <p
            className={`text-sm font-medium ${
              isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
            }`}
          >
            {task.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                PRIORITY_STYLES[task.priority]
              }`}
            >
              {PRIORITY_LABELS[task.priority]}
            </span>
            {task.projectId && projectName && (
              <Link
                to={`/projects/${task.projectId}`}
                className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-accent/60"
                onClick={(e) => e.stopPropagation()}
              >
                {projectName}
              </Link>
            )}
            {task.dueDate > 0 && <span>{formatRelative(task.dueDate)}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          aria-label={isExpanded ? 'Ocultar detalles' : 'Editar tarea'}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Descripción
            </span>
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder="Agregá notas o detalles..."
              rows={3}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Prioridad
              </span>
              <select
                value={task.priority}
                onChange={handlePriorityChange}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Proyecto
              </span>
              <select
                value={task.projectId}
                onChange={handleProjectChange}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
              >
                <option value="">(sin proyecto)</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Fecha
              </span>
              <input
                type="date"
                value={toDateInputValue(task.dueDate)}
                onChange={handleDateChange}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
