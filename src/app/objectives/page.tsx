import { useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import { Plus } from 'lucide-react';
import useObjectives from '@/hooks/useObjectives';
import useProjects from '@/hooks/useProjects';
import ObjectiveCard, { type ProjectMini } from '@/components/objectives/ObjectiveCard';
import ObjectiveCreateModal from '@/components/objectives/ObjectiveCreateModal';
import { AREAS, type AreaKey } from '@/types/area';
import type { Objective } from '@/types/objective';

const AREA_ORDER: AreaKey[] = [
  'proyectos',
  'conocimiento',
  'finanzas',
  'salud',
  'pareja',
  'habitos',
];

interface ObjectiveGroup {
  key: string;
  label: string;
  emoji: string;
  objectives: Objective[];
}

export default function ObjectivesPage() {
  const { objectives, isInitializing, createObjective, updateObjective } = useObjectives();
  const { projects, updateProject } = useProjects();
  const tasksTable = useTable('tasks', 'tasks');
  const [modalOpen, setModalOpen] = useState(false);

  // Cross-store: stats de tareas por projectId
  const tasksByProjectId = useMemo<Record<string, { total: number; completed: number }>>(() => {
    const out: Record<string, { total: number; completed: number }> = {};
    for (const row of Object.values(tasksTable)) {
      const pid = (row.projectId as string) || '';
      if (!pid) continue;
      if (!out[pid]) out[pid] = { total: 0, completed: 0 };
      out[pid].total += 1;
      if (row.status === 'completed') out[pid].completed += 1;
    }
    return out;
  }, [tasksTable]);

  function computeProgress(projectIds: string[]): number {
    if (projectIds.length === 0) return 0;
    const percents = projectIds.map((pid) => {
      const stats = tasksByProjectId[pid];
      if (!stats || stats.total === 0) return 0;
      return (stats.completed / stats.total) * 100;
    });
    return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
  }

  // Filtrar no archivados y agrupar por área
  const visible = useMemo(() => objectives.filter((o) => !o.isArchived), [objectives]);

  const groups = useMemo<ObjectiveGroup[]>(() => {
    const out: ObjectiveGroup[] = [];
    for (const areaId of AREA_ORDER) {
      const area = AREAS[areaId];
      const groupObjectives = visible.filter((o) => o.areaId === areaId);
      if (groupObjectives.length > 0) {
        out.push({
          key: areaId,
          label: area.label,
          emoji: area.emoji,
          objectives: groupObjectives,
        });
      }
    }
    // Objetivos con areaId vacío o no reconocido
    const orphans = visible.filter((o) => !o.areaId || !AREAS[o.areaId as AreaKey]);
    if (orphans.length > 0) {
      out.push({ key: '__orphans', label: 'Sin área', emoji: '', objectives: orphans });
    }
    return out;
  }, [visible]);

  async function handleLinkProject(objectiveId: string, projectId: string) {
    const objective = objectives.find((o) => o.id === objectiveId);
    if (!objective) return;
    if (objective.projectIds.includes(projectId)) return;
    await updateObjective(objectiveId, {
      projectIds: [...objective.projectIds, projectId],
    });
    await updateProject(projectId, { objectiveId });
  }

  async function handleUnlinkProject(objectiveId: string, projectId: string) {
    const objective = objectives.find((o) => o.id === objectiveId);
    if (!objective) return;
    await updateObjective(objectiveId, {
      projectIds: objective.projectIds.filter((id) => id !== projectId),
    });
    await updateProject(projectId, { objectiveId: '' });
  }

  const showSkeleton = isInitializing && visible.length === 0;
  const showEmpty = !isInitializing && visible.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 hidden items-center justify-between gap-4 md:flex">
        <h1 className="text-2xl font-bold tracking-tight">Objetivos</h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Nuevo objetivo
        </button>
      </header>

      {showSkeleton && <ObjectivesSkeleton />}

      {showEmpty && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-base font-medium text-foreground">Sin objetivos aún</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea tu primer objetivo para empezar a medir progreso.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Crear primer objetivo
          </button>
        </div>
      )}

      {!showSkeleton && !showEmpty && (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.emoji} {group.label}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.objectives.map((objective) => {
                  // linkedProjects usa project.objectiveId como fuente de verdad
                  // (más robusto que objective.projectIds en caso de drift)
                  const linkedProjects: ProjectMini[] = projects
                    .filter((p) => p.objectiveId === objective.id && !p.isArchived)
                    .map((p) => {
                      const stats = tasksByProjectId[p.id];
                      const percent =
                        stats && stats.total > 0
                          ? Math.round((stats.completed / stats.total) * 100)
                          : 0;
                      return { id: p.id, name: p.name, percent };
                    });

                  const linkedIds = new Set(linkedProjects.map((p) => p.id));
                  const availableProjects = projects
                    .filter((p) => !p.isArchived && !linkedIds.has(p.id))
                    .map((p) => ({ id: p.id, name: p.name }));

                  const overallPercent = computeProgress(linkedProjects.map((p) => p.id));

                  return (
                    <li key={objective.id}>
                      <ObjectiveCard
                        objective={objective}
                        linkedProjects={linkedProjects}
                        availableProjects={availableProjects}
                        overallPercent={overallPercent}
                        onLinkProject={(projectId) =>
                          void handleLinkProject(objective.id, projectId)
                        }
                        onUnlinkProject={(projectId) =>
                          void handleUnlinkProject(objective.id, projectId)
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ObjectiveCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreate={(input) => createObjective(input)}
      />
    </div>
  );
}

function ObjectivesSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-1.5 w-full animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}
