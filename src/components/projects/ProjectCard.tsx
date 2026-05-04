import { Link } from 'react-router';
import { AREAS, type AreaKey } from '@/types/area';
import PendingSyncDot from '@/components/layout/PendingSyncDot';
import type { Project } from '@/types/project';
import type { Priority } from '@/types/common';

interface ProjectCardProps {
  project: Project;
  pendingTaskCount: number;
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

export default function ProjectCard({ project, pendingTaskCount }: ProjectCardProps) {
  const area = AREAS[project.areaId as AreaKey];

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group relative block rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-accent/40"
    >
      <PendingSyncDot entityType="project" id={project.id} />
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            PRIORITY_STYLES[project.priority]
          }`}
        >
          {PRIORITY_LABELS[project.priority]}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {area && (
          <span>
            {area.emoji} {area.label}
          </span>
        )}
        <span>
          {pendingTaskCount > 0
            ? `${pendingTaskCount} ${
                pendingTaskCount === 1 ? 'tarea pendiente' : 'tareas pendientes'
              }`
            : 'Sin tareas pendientes'}
        </span>
      </div>
    </Link>
  );
}
