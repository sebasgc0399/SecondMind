import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Dialog } from '@base-ui/react';
import {
  CheckSquare,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Repeat,
  Search,
  Settings,
  Target,
} from 'lucide-react';
import { CommandPaletteContext, type CommandPaletteContextValue } from '@/hooks/useCommandPalette';
// eslint-disable-next-line import/order -- false positive con type imports inline; auto-fix no resuelve
import useGlobalSearch, { type SearchResult } from '@/hooks/useGlobalSearch';

// --- Provider ---

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export function CommandPaletteProvider({ children }: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        setIsOpen((current) => !current);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ isOpen, open, close }),
    [isOpen, open, close],
  );

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

// --- Quick actions (static, shown when query is empty) ---

interface QuickAction {
  id: string;
  label: string;
  icon: typeof FileText;
  url: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'action-dashboard', label: 'Dashboard', icon: LayoutDashboard, url: '/' },
  { id: 'action-inbox', label: 'Inbox', icon: Inbox, url: '/inbox' },
  { id: 'action-notes', label: 'Notas', icon: FileText, url: '/notes' },
  { id: 'action-tasks', label: 'Tareas', icon: CheckSquare, url: '/tasks' },
  { id: 'action-projects', label: 'Proyectos', icon: FolderKanban, url: '/projects' },
  { id: 'action-objectives', label: 'Objetivos', icon: Target, url: '/objectives' },
  { id: 'action-habits', label: 'Hábitos', icon: Repeat, url: '/habits' },
  { id: 'action-settings', label: 'Settings', icon: Settings, url: '/settings' },
];

// --- Palette item type (unified for keyboard nav) ---

type PaletteItem = { kind: 'result'; data: SearchResult } | { kind: 'action'; data: QuickAction };

function getItemUrl(item: PaletteItem): string {
  if (item.kind === 'action') return item.data.url;
  const r = item.data;
  if (r.type === 'note') return `/notes/${r.id}`;
  if (r.type === 'project') return `/projects/${r.id}`;
  return '/tasks';
}

// --- Type icons ---

const TYPE_ICONS: Record<string, typeof FileText> = {
  note: FileText,
  task: CheckSquare,
  project: FolderKanban,
};

// --- Dialog content ---

interface CommandPaletteContentProps {
  onClose: () => void;
}

function CommandPaletteContent({ onClose }: CommandPaletteContentProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const results = useGlobalSearch(query);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();

  // Build flat items list for keyboard navigation
  const items = useMemo<PaletteItem[]>(() => {
    if (trimmed) {
      return results.map((r) => ({ kind: 'result' as const, data: r }));
    }
    // No query: recentes + acciones rápidas
    const recents: PaletteItem[] = results.map((r) => ({ kind: 'result' as const, data: r }));
    const actions: PaletteItem[] = QUICK_ACTIONS.map((a) => ({ kind: 'action' as const, data: a }));
    return [...recents, ...actions];
  }, [results, trimmed]);

  // Reset selection on query change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset del cursor al cambio de query; refactor canónico (lift state up al CommandPaletteProvider o useReducer con action 'queryChanged') está fuera del scope de este componente
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const navigateTo = useCallback(
    (item: PaletteItem) => {
      const url = getItemUrl(item);
      onClose();
      navigate(url);
    },
    [onClose, navigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item) navigateTo(item);
      }
    },
    [items, selectedIndex, navigateTo],
  );

  // Group search results by type for display
  const grouped = useMemo(() => {
    if (!trimmed) return null;
    const notes = results.filter((r) => r.type === 'note');
    const tasks = results.filter((r) => r.type === 'task');
    const projects = results.filter((r) => r.type === 'project');
    return { notes, tasks, projects };
  }, [results, trimmed]);

  // Compute flat index offset for grouped display
  let flatIndex = 0;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-3 pb-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar notas, tareas, proyectos..."
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          autoFocus
        />
      </div>

      <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
        {/* Search results grouped */}
        {trimmed && grouped && items.length > 0 && (
          <>
            {grouped.notes.length > 0 && (
              <ResultSection
                label="📝 Notas"
                results={grouped.notes}
                startIndex={((flatIndex = 0), flatIndex)}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                onNavigate={(r) => navigateTo({ kind: 'result', data: r })}
              />
            )}
            {(() => {
              flatIndex = grouped.notes.length;
              return null;
            })()}
            {grouped.tasks.length > 0 && (
              <ResultSection
                label="✅ Tareas"
                results={grouped.tasks}
                startIndex={flatIndex}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                onNavigate={(r) => navigateTo({ kind: 'result', data: r })}
              />
            )}
            {(() => {
              flatIndex += grouped.tasks.length;
              return null;
            })()}
            {grouped.projects.length > 0 && (
              <ResultSection
                label="🚀 Proyectos"
                results={grouped.projects}
                startIndex={flatIndex}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                onNavigate={(r) => navigateTo({ kind: 'result', data: r })}
              />
            )}
          </>
        )}

        {/* No results */}
        {trimmed && items.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Sin resultados para &ldquo;{trimmed}&rdquo;
          </p>
        )}

        {/* Empty query: recentes + acciones */}
        {!trimmed && (
          <>
            {results.length > 0 && (
              <div>
                <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recientes
                </p>
                {results.map((r, i) => {
                  const Icon = TYPE_ICONS[r.type] ?? FileText;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => navigateTo({ kind: 'result', data: r })}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                        selectedIndex === i
                          ? 'bg-accent/60 text-foreground'
                          : 'text-foreground hover:bg-accent/40'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{r.title}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-1">
              <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Acciones
              </p>
              {QUICK_ACTIONS.map((action, i) => {
                const globalIndex = results.length + i;
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => navigateTo({ kind: 'action', data: action })}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                      selectedIndex === globalIndex
                        ? 'bg-accent/60 text-foreground'
                        : 'text-foreground hover:bg-accent/40'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Result section with header ---

interface ResultSectionProps {
  label: string;
  results: SearchResult[];
  startIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onNavigate: (result: SearchResult) => void;
}

function ResultSection({
  label,
  results,
  startIndex,
  selectedIndex,
  onSelect,
  onNavigate,
}: ResultSectionProps) {
  return (
    <div>
      <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {results.map((r, i) => {
        const globalIndex = startIndex + i;
        const Icon = TYPE_ICONS[r.type] ?? FileText;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onNavigate(r)}
            onMouseEnter={() => onSelect(globalIndex)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
              selectedIndex === globalIndex
                ? 'bg-accent/60 text-foreground'
                : 'text-foreground hover:bg-accent/40'
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <span className="truncate">{r.title}</span>
              {r.snippet && <p className="truncate text-xs text-muted-foreground">{r.snippet}</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// --- Main export: Dialog ---

export default function CommandPalette() {
  const { isOpen, close } = useCommandPalette();

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) close();
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background-deep/80 backdrop-blur-sm transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-[15vh] left-1/2 z-50 w-[90vw] max-w-lg -translate-x-1/2 scale-100 rounded-xl border border-border-strong bg-card p-3 opacity-100 shadow-modal outline-none transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Title className="sr-only">Buscar</Dialog.Title>
          {isOpen && <CommandPaletteContent onClose={close} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Re-export for convenience
import useCommandPalette from '@/hooks/useCommandPalette';
