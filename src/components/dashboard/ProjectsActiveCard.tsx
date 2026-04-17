import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTable } from 'tinybase/ui-react';
import useProjects from '@/hooks/useProjects';
import type { Project } from '@/types/project';

const PREVIEW_LIMIT = 5;

export default function ProjectsActiveCard() {
  const { projects, isInitializing } = useProjects();
  const tasksTable = useTable('tasks', 'tasks');

  const pendingCountsByProjectId = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const row of Object.values(tasksTable)) {
      const pid = (row.projectId as string) || '';
      if (!pid) continue;
      if (row.status === 'completed') continue;
      out[pid] = (out[pid] ?? 0) + 1;
    }
    return out;
  }, [tasksTable]);

  const activeProjects = useMemo<Project[]>(
    () =>
      projects.filter((p) => !p.isArchived && p.status === 'in-progress').slice(0, PREVIEW_LIMIT),
    [projects],
  );

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">🚀 Proyectos activos</h2>
        {activeProjects.length > 0 && (
          <Link
            to="/projects"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver todos →
          </Link>
        )}
      </header>

      {isInitializing && activeProjects.length === 0 ? (
        <CardSkeleton rows={3} />
      ) : activeProjects.length === 0 ? (
        <div className="flex flex-col items-start gap-1">
          <p className="text-sm text-muted-foreground">Sin proyectos activos</p>
          <Link
            to="/projects"
            className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            Ver proyectos →
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {activeProjects.map((project) => {
            const count = pendingCountsByProjectId[project.id] ?? 0;
            return (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}`}
                  className="group flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 p-2 transition-colors hover:border-border hover:bg-accent/30"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {project.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {count > 0
                      ? `${count} ${count === 1 ? 'tarea pendiente' : 'tareas pendientes'}`
                      : 'Sin tareas pendientes'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 p-2"
        >
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
