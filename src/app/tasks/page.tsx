import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTable } from 'tinybase/ui-react';
import useTasks from '@/hooks/useTasks';
import TaskInlineCreate from '@/components/tasks/TaskInlineCreate';
import TaskCard from '@/components/tasks/TaskCard';
import { isOverdue } from '@/lib/taskHelpers';
import { isSameDay, startOfDay } from '@/lib/formatDate';
import type { Task } from '@/types/task';

type TabKey = 'today' | 'soon' | 'completed';

const DAY_MS = 24 * 60 * 60 * 1000;
const COMPLETED_LIMIT = 20;

interface TaskGroup {
  label: string;
  icon?: LucideIcon;
  tasks: Task[];
}

export default function TasksPage() {
  const { t, i18n } = useTranslation();
  const { tasks, isInitializing, createTask, updateTask, completeTask } = useTasks();
  const [activeTab, setActiveTab] = useState<TabKey>('today');

  const tabs = useMemo<{ key: TabKey; label: string }[]>(
    () => [
      { key: 'today', label: t('tasks.tabs.today', 'Hoy') },
      { key: 'soon', label: t('tasks.tabs.soon', 'Pronto') },
      { key: 'completed', label: t('tasks.tabs.completed', 'Completadas') },
    ],
    [t],
  );

  // Lookup de proyectos para resolver nombres y para el selector del expand
  const projectsTable = useTable('projects', 'projects');
  const projectOptions = useMemo(() => {
    return Object.entries(projectsTable)
      .map(([id, row]) => ({
        id,
        name: (row.name as string) || t('projects.noName', '(sin nombre)'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language || 'es'));
  }, [projectsTable, t, i18n.language]);
  const projectsById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projectOptions) map[p.id] = p.name;
    return map;
  }, [projectOptions]);

  const groups = useMemo<TaskGroup[]>(() => {
    // eslint-disable-next-line react-hooks/purity -- render se invalida por cambios en tasks; drift sub-segundo invisible
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
      if (overdue.length > 0)
        out.push({
          label: t('tasks.groups.overdue', 'Vencidas'),
          icon: AlertTriangle,
          tasks: overdue,
        });
      if (todayList.length > 0)
        out.push({ label: t('tasks.groups.today', 'Hoy'), icon: CalendarClock, tasks: todayList });
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
      const dayFormatter = new Intl.DateTimeFormat(i18n.language || 'es', {
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
  }, [tasks, activeTab, t, i18n.language]);

  const totalInActiveTab = groups.reduce((sum, g) => sum + g.tasks.length, 0);
  const showSkeleton = isInitializing && totalInActiveTab === 0;
  const showEmpty = !isInitializing && totalInActiveTab === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 hidden md:block">
        <h1 className="text-2xl font-bold tracking-tight">{t('tasks.title', 'Tareas')}</h1>
      </header>

      <div className="mb-4">
        <TaskInlineCreate onCreate={(name) => void createTask(name)} />
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
        {tabs.map((tab) => {
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
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.icon && <group.icon className="h-3.5 w-3.5" aria-hidden />}
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
  const { t } = useTranslation();
  const copy: Record<TabKey, { title: string; hint: string }> = {
    today: {
      title: t('tasks.empty.todayTitle', 'Nada para hoy 🎉'),
      hint: t('tasks.empty.todayHint', 'Crea una tarea arriba o revisa el tab “Pronto”.'),
    },
    soon: {
      title: t('tasks.empty.soonTitle', 'Sin tareas próximas'),
      hint: t(
        'tasks.empty.soonHint',
        'Las tareas con fecha en los próximos 7 días aparecerán acá.',
      ),
    },
    completed: {
      title: t('tasks.empty.completedTitle', 'Aún no completaste tareas'),
      hint: t('tasks.empty.completedHint', '¡A darle! Las últimas 20 completadas aparecerán acá.'),
    },
  };
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="text-base font-medium text-foreground">{copy[tab].title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy[tab].hint}</p>
    </div>
  );
}
