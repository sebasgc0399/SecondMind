import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { MoreHorizontal, ChevronUp, X } from 'lucide-react';
import PendingSyncDot from '@/components/layout/PendingSyncDot';
import type { Objective } from '@/types/objective';
import type { ObjectiveStatus } from '@/types/common';

export interface ProjectMini {
  id: string;
  name: string;
  percent: number;
}

interface ObjectiveCardProps {
  objective: Objective;
  linkedProjects: ProjectMini[];
  availableProjects: { id: string; name: string }[];
  overallPercent: number;
  onLinkProject: (projectId: string) => void;
  onUnlinkProject: (projectId: string) => void;
}

const STATUS_STYLES: Record<ObjectiveStatus, string> = {
  'not-started': 'bg-muted/60 text-muted-foreground',
  'in-progress': 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
};

const STATUS_LABELS: Record<ObjectiveStatus, string> = {
  'not-started': 'No empezado',
  'in-progress': 'En progreso',
  completed: 'Completado',
};

function formatDeadline(deadline: number): string {
  if (!deadline) return 'Sin deadline';
  const diffMs = deadline - Date.now();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  const dateStr = new Date(deadline).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (diffDays > 1) return `${dateStr} · faltan ${diffDays} días`;
  if (diffDays === 1) return `${dateStr} · mañana`;
  if (diffDays === 0) return `${dateStr} · hoy`;
  const abs = Math.abs(diffDays);
  return `${dateStr} · vencido hace ${abs} ${abs === 1 ? 'día' : 'días'}`;
}

export default function ObjectiveCard({
  objective,
  linkedProjects,
  availableProjects,
  overallPercent,
  onLinkProject,
  onUnlinkProject,
}: ObjectiveCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLinkChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const projectId = e.target.value;
    if (projectId) {
      onLinkProject(projectId);
      e.target.value = '';
    }
  };

  return (
    <div className="relative rounded-lg border border-border bg-card p-4">
      <PendingSyncDot entityType="objective" id={objective.id} />
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{objective.name}</h3>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                STATUS_STYLES[objective.status]
              }`}
            >
              {STATUS_LABELS[objective.status]}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{formatDeadline(objective.deadline)}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          aria-label={isExpanded ? 'Ocultar detalles' : 'Expandir objetivo'}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {overallPercent}% completado · {linkedProjects.length}{' '}
            {linkedProjects.length === 1 ? 'proyecto' : 'proyectos'}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          {linkedProjects.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin proyectos vinculados aún.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {linkedProjects.map((p) => (
                <li
                  key={p.id}
                  className="group flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
                >
                  <Link
                    to={`/projects/${p.id}`}
                    className="flex-1 min-w-0 truncate text-sm text-foreground transition-colors hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  <span className="text-[11px] text-muted-foreground">{p.percent}%</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onUnlinkProject(p.id);
                    }}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-destructive"
                    aria-label="Desvincular proyecto"
                    title="Desvincular"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Vincular proyecto
            </span>
            <select
              value=""
              onChange={handleLinkChange}
              disabled={availableProjects.length === 0}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">
                {availableProjects.length === 0
                  ? '(sin proyectos disponibles)'
                  : '+ Vincular proyecto...'}
              </option>
              {availableProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
