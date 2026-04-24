import { useMemo, useState } from 'react';
import { useTable } from 'tinybase/ui-react';
import useTasks from '@/hooks/useTasks';
import TaskInlineCreate from '@/components/tasks/TaskInlineCreate';
import TaskCard, { isOverdue } from '@/components/tasks/TaskCard';
import { isSameDay, startOfDay } from '@/lib/formatDate';
import type { Task } from '@/types/task';

type TabKey = 'today' | 'soon' | 'completed';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'soon', label: 'Pronto' },
  { key: 'completed', label: 'Completadas' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const COMPLETED_LIMIT = 20;

interface TaskGroup {
  label: string;
  tasks: Task[];
}

export default function TasksPage() {
  const { tasks, isInitializing, createTask, updateTask, completeTask } = useTasks();
  const [activeTab, setActiveTab] = useState<TabKey>('today');

  // Lookup de proyectos para resolver nombres y para el selector del expand
  const projectsTable = useTable('projects', 'projects');
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

  const groups = useMemo<TaskGroup[]>(() => {
    const now = Date.now();
    const today = startOfDay(now);
    const weekFromNow = now + 7 * DAY_MS;

    if (activeTab === 'today') {
      const overdue: Task[] = [];
      const todayList: Task[] = [];
      for (const t of tasks) {
        if (t.status === 'completed') continue;
        if (t.dueDate === 0) continue;
        if (isOverdue(t)) overdue.push(t);
        else if (isSameDay(t.dueDate, now)) todayList.push(t);
      }
      const out: TaskGroup[] = [];
      if (overdue.length > 0) out.push({ label: '⚠️ Vencidas', tasks: overdue });
      if (todayList.length > 0) out.push({ label: '📅 Hoy', tasks: todayList });
      return out;
    }

    if (activeTab === 'soon') {
      const endOfToday = today + DAY_MS - 1;
      const upcoming = tasks.filter(
        (t) => t.status !== 'completed' && t.dueDate > endOfToday && t.dueDate <= weekFromNow,
      );
      // Agrupar por día usando startOfDay como clave
      const byDay = new Map<number, Task[]>();
      for (const t of upcoming) {
        const key = startOfDay(t.dueDate);
        const bucket = byDay.get(key);
        if (bucket) bucket.push(t);
        else byDay.set(key, [t]);
      }
      const sortedKeys = Array.from(byDay.keys()).sort((a, b) => a - b);
      const dayFormatter = new Intl.DateTimeFormat('es', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      });
      return sortedKeys.map((k) => ({
        label: dayFormatter.format(new Date(k)),
        tasks: byDay.get(k) ?? [],
      }));
    }

    // completed
    const completed = tasks
      .filter((t) => t.status === 'completed')
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, COMPLETED_LIMIT);
    return completed.length > 0 ? [{ label: '', tasks: completed }] : [];
  }, [tasks, activeTab]);

  const totalInActiveTab = groups.reduce((sum, g) => sum + g.tasks.length, 0);
  const showSkeleton = isInitializing && totalInActiveTab === 0;
  const showEmpty = !isInitializing && totalInActiveTab === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Tareas</h1>
      </header>

      <div className="mb-4">
        <TaskInlineCreate onCreate={(name) => void createTask(name)} />
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors md:py-2 ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {showSkeleton && <TasksSkeleton />}
      {showEmpty && <EmptyState tab={activeTab} />}

      {!showSkeleton && !showEmpty && (
        <div className="flex flex-col gap-6">
          {groups.map((group, idx) => (
            <section key={`${activeTab}-${idx}-${group.label}`}>
              {group.label && (
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h2>
              )}
              <ul className="flex flex-col gap-3">
                {group.tasks.map((task) => (
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TasksSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const copy: Record<TabKey, { title: string; hint: string }> = {
    today: {
      title: 'Nada para hoy 🎉',
      hint: 'Creá una tarea arriba o revisá el tab “Pronto”.',
    },
    soon: {
      title: 'Sin tareas próximas',
      hint: 'Las tareas con fecha en los próximos 7 días aparecerán acá.',
    },
    completed: {
      title: 'Aún no completaste tareas',
      hint: '¡A darle! Las últimas 20 completadas aparecerán acá.',
    },
  };
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="text-base font-medium text-foreground">{copy[tab].title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy[tab].hint}</p>
    </div>
  );
}
