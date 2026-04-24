import { useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { Plus } from 'lucide-react';
import useProjects from '@/hooks/useProjects';
import ProjectCard from '@/components/projects/ProjectCard';
import ProjectCreateModal from '@/components/projects/ProjectCreateModal';
import type { Project } from '@/types/project';
import type { ProjectStatus } from '@/types/common';

const STATUS_ORDER: ProjectStatus[] = ['in-progress', 'not-started', 'on-hold'];

const STATUS_LABELS: Record<ProjectStatus, string> = {
  'in-progress': 'En progreso',
  'not-started': 'No empezados',
  'on-hold': 'En pausa',
  inbox: 'Sin clasificar',
  completed: 'Completados',
};

interface ProjectGroup {
  status: ProjectStatus;
  label: string;
  projects: Project[];
}

export default function ProjectsPage() {
  const { projects, isInitializing, createProject } = useProjects();
  const [modalOpen, setModalOpen] = useState(false);

  // Cross-store: contar tareas pendientes por proyecto
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

  // Filtrar visibles: no archivados + no completados
  const visible = useMemo(
    () => projects.filter((p) => !p.isArchived && p.status !== 'completed'),
    [projects],
  );

  const groups = useMemo<ProjectGroup[]>(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      projects: visible.filter((p) => p.status === status),
    })).filter((g) => g.projects.length > 0);
  }, [visible]);

  const totalVisible = visible.length;
  const showSkeleton = isInitializing && totalVisible === 0;
  const showEmpty = !isInitializing && totalVisible === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 hidden items-center justify-between gap-4 md:flex">
        <h1 className="text-2xl font-bold tracking-tight">Proyectos</h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Nuevo proyecto
        </button>
      </header>

      {showSkeleton && <ProjectsSkeleton />}

      {showEmpty && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-base font-medium text-foreground">Sin proyectos aún</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea tu primer proyecto para empezar a agrupar tareas y notas.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Crear primer proyecto
          </button>
        </div>
      )}

      {!showSkeleton && !showEmpty && (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.status}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.projects.map((project) => (
                  <li key={project.id}>
                    <ProjectCard
                      project={project}
                      pendingTaskCount={pendingCountsByProjectId[project.id] ?? 0}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ProjectCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreate={(input) => createProject(input)}
      />
    </div>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
