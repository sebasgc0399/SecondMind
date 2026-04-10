import {
  LayoutDashboard,
  Inbox,
  FileText,
  CheckSquare,
  FolderKanban,
  Target,
  Repeat,
  LogOut,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { LucideIcon } from 'lucide-react';

interface SidebarProps {
  user: User;
  onSignOut: () => Promise<void>;
}

interface NavItem {
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Inbox', icon: Inbox },
  { label: 'Notas', icon: FileText },
  { label: 'Tareas', icon: CheckSquare },
  { label: 'Proyectos', icon: FolderKanban },
  { label: 'Objetivos', icon: Target },
  { label: 'Hábitos', icon: Repeat },
];

export default function Sidebar({ user, onSignOut }: SidebarProps) {
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
        {navItems.map((item) => (
          <button
            key={item.label}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
