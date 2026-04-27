import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTable } from 'tinybase/ui-react';
import { ArrowLeft, Plus } from 'lucide-react';
import { notesStore } from '@/stores/notesStore';
import { parseIds, stringifyIds } from '@/lib/tinybase';
import { notesRepo } from '@/infra/repos/notesRepo';
import useAuth from '@/hooks/useAuth';
import useProjects from '@/hooks/useProjects';
import useTasks from '@/hooks/useTasks';
import { useStoreHydration } from '@/hooks/useStoreHydration';
import TaskCard from '@/components/tasks/TaskCard';
import TaskInlineCreate from '@/components/tasks/TaskInlineCreate';
import ProjectNoteList, { type LinkedNote } from '@/components/projects/ProjectNoteList';
import NoteLinkModal from '@/components/projects/NoteLinkModal';
import type { Priority, ProjectStatus } from '@/types/common';

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'not-started', label: 'No empezado' },
  { value: 'in-progress', label: 'En progreso' },
  { value: 'on-hold', label: 'En pausa' },
  { value: 'completed', label: 'Completado' },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects, updateProject } = useProjects();
  const { tasks, createTask, updateTask, completeTask } = useTasks();
  const notesTable = useTable('notes');
  const projectsTable = useTable('projects', 'projects');
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  // Signal real de hidratación de stores. Reemplaza el grace arbitrario de
  // 1500ms (workaround del isInitializing de 200ms de useProjects que era
  // pre-F11). Ahora el redirect espera a que startAutoLoad realmente termine.
  const { isHydrating } = useStoreHydration();

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  // Redirect solo cuando los stores hidrataron Y el proyecto sigue sin aparecer
  useEffect(() => {
    if (!isHydrating && projectId && !project) {
      navigate('/projects', { replace: true });
    }
  }, [isHydrating, project, projectId, navigate]);

  // Tareas del proyecto
  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === projectId),
    [tasks, projectId],
  );

  // Opciones de proyecto para el select en TaskCard expand
  const projectOptions = useMemo(() => {
    return Object.entries(projectsTable)
      .map(([id, row]) => ({ id, name: (row.name as string) || '(sin nombre)' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectsTable]);
  const projectsById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projectOptions) map[p.id] = p.name;
    return map;
  }, [projectOptions]);

  // Notas vinculadas: iterar notesTable y filtrar por projectIds
  const linkedNotes = useMemo<LinkedNote[]>(() => {
    if (!projectId) return [];
    const out: LinkedNote[] = [];
    for (const [id, row] of Object.entries(notesTable)) {
      const projectIds = parseIds(row.projectIds as string | undefined);
      if (!projectIds.includes(projectId)) continue;
      out.push({
        id,
        title: ((row.title as string) || '').trim() || 'Sin título',
        paraType: (row.paraType as string) || 'resource',
        noteType: (row.noteType as string) || 'fleeting',
        updatedAt: Number(row.updatedAt) || 0,
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notesTable, projectId]);

  const linkedNoteIds = useMemo(() => linkedNotes.map((n) => n.id), [linkedNotes]);

  // Progreso
  const completed = projectTasks.filter((t) => t.status === 'completed').length;
  const total = projectTasks.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // ¿Hay notas en el sistema? Si no, deshabilitar botón vincular
  const hasAnyNotes = Object.keys(notesTable).length > 0;

  // Mientras los stores hidratan y todavía no aparece, mostramos skeleton.
  // Si terminaron de hidratar y sigue sin aparecer, el useEffect de arriba
  // ya disparó el redirect — devolvemos null mientras navega.
  if (!project || !projectId) {
    if (isHydrating) {
      return (
        <div className="mx-auto max-w-3xl">
          <ProjectDetailSkeleton />
        </div>
      );
    }
    return null;
  }

  async function handleCreateTask(name: string) {
    const taskId = await createTask(name);
    if (taskId) {
      await updateTask(taskId, { projectId });
    }
  }

  async function handleStatusChange(next: ProjectStatus) {
    if (!projectId) return;
    await updateProject(projectId, { status: next });
  }

  async function handlePriorityChange(next: Priority) {
    if (!projectId) return;
    await updateProject(projectId, { priority: next });
  }

  async function handleLinkNote(noteId: string) {
    if (!user || !projectId || !project) return;

    const noteRow = notesStore.getRow('notes', noteId);
    const currentProjectIds = parseIds(noteRow.projectIds as string | undefined);
    if (currentProjectIds.includes(projectId)) return;
    const nextProjectIds = [...currentProjectIds, projectId];

    await notesRepo.updateMeta(noteId, {
      projectIds: stringifyIds(nextProjectIds),
      updatedAt: Date.now(),
    });

    if (!project.noteIds.includes(noteId)) {
      await updateProject(projectId, { noteIds: [...project.noteIds, noteId] });
    }
  }

  async function handleUnlinkNote(noteId: string) {
    if (!user || !projectId || !project) return;

    const noteRow = notesStore.getRow('notes', noteId);
    const currentProjectIds = parseIds(noteRow.projectIds as string | undefined);
    const nextProjectIds = currentProjectIds.filter((id) => id !== projectId);

    await notesRepo.updateMeta(noteId, {
      projectIds: stringifyIds(nextProjectIds),
      updatedAt: Date.now(),
    });

    const nextProjectNoteIds = project.noteIds.filter((id) => id !== noteId);
    await updateProject(projectId, { noteIds: nextProjectNoteIds });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Proyectos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{project.name}</h1>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </span>
            <select
              value={project.status}
              onChange={(e) => void handleStatusChange(e.target.value as ProjectStatus)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Prioridad
            </span>
            <select
              value={project.priority}
              onChange={(e) => void handlePriorityChange(e.target.value as Priority)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Progreso</span>
          <span>
            {completed} de {total} tareas completadas ({percent}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tareas ({total})
        </h2>
        <div className="mb-3">
          <TaskInlineCreate onCreate={handleCreateTask} />
        </div>
        {projectTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">Sin tareas aún</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crea una tarea arriba para empezar.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {projectTasks.map((task) => (
              <li key={task.id}>
                <TaskCard
                  task={task}
                  projectName={projectsById[task.projectId]}
                  projectOptions={projectOptions}
                  onToggleComplete={(id) => void completeTask(id)}
                  onUpdate={(id, updates) => void updateTask(id, updates)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notas vinculadas ({linkedNotes.length})
          </h2>
          <button
            type="button"
            onClick={() => setLinkModalOpen(true)}
            disabled={!hasAnyNotes}
            title={hasAnyNotes ? 'Vincular nota existente' : 'Crea una nota primero'}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Vincular nota
          </button>
        </div>
        <ProjectNoteList notes={linkedNotes} onUnlink={(id) => void handleUnlinkNote(id)} />
      </section>

      <NoteLinkModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        onPick={(noteId) => void handleLinkNote(noteId)}
        excludeNoteIds={linkedNoteIds}
      />
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-2 flex gap-3">
          <div className="h-9 w-32 animate-pulse rounded bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
