import { NavLink } from 'react-router';
import {
  LayoutDashboard,
  Inbox,
  FileText,
  CheckSquare,
  FolderKanban,
  Target,
  Repeat,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePendingInboxCount } from '@/hooks/useInbox';
import type { User } from 'firebase/auth';
import type { LucideIcon } from 'lucide-react';

interface SidebarProps {
  user: User;
  onSignOut: () => Promise<void>;
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  to?: string;
  end?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true },
  { label: 'Inbox', icon: Inbox, to: '/inbox' },
  { label: 'Notas', icon: FileText, to: '/notes' },
  { label: 'Tareas', icon: CheckSquare, to: '/tasks' },
  { label: 'Proyectos', icon: FolderKanban, to: '/projects' },
  { label: 'Objetivos', icon: Target, to: '/objectives' },
  { label: 'Hábitos', icon: Repeat, to: '/habits' },
];

const baseItemClass =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors';
const inactiveClass =
  'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
const activeClass = 'bg-sidebar-accent text-sidebar-accent-foreground';

export default function Sidebar({ user, onSignOut }: SidebarProps) {
  const pendingInboxCount = usePendingInboxCount();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 border-b border-sidebar-border p-4">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName ?? 'Avatar'}
            className="h-8 w-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-sidebar-primary" />
        )}
        <span className="truncate text-sm font-medium text-sidebar-foreground">
          {user.displayName ?? 'SecondMind'}
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) =>
          item.to ? (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(baseItemClass, isActive ? activeClass : inactiveClass)
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.to === '/inbox' && pendingInboxCount > 0 && (
                <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {pendingInboxCount}
                </span>
              )}
            </NavLink>
          ) : (
            <button
              key={item.label}
              type="button"
              disabled
              title="Próximamente — Fase 2"
              className={cn(baseItemClass, 'cursor-not-allowed text-sidebar-foreground opacity-50')}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ),
        )}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-2">
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(baseItemClass, isActive ? activeClass : inactiveClass)}
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
        <button type="button" onClick={onSignOut} className={cn(baseItemClass, inactiveClass)}>
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
