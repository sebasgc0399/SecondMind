import { NavLink } from 'react-router';
import { Settings, LogOut, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePendingInboxCount } from '@/hooks/useInbox';
import PendingSyncIndicator from './PendingSyncIndicator';
import { navItems } from './navItems';
import type { User } from 'firebase/auth';

interface SidebarProps {
  user: User;
  onSignOut: () => Promise<void>;
  collapsed?: boolean;
  onExpandClick?: () => void;
}

const baseItemClass = 'flex w-full items-center gap-3 rounded-md text-sm transition-colors';
const inactiveClass =
  'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
const activeClass = 'bg-sidebar-accent text-sidebar-accent-foreground';

interface SidebarContentProps {
  user: User;
  onSignOut: () => Promise<void>;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarContent({ user, onSignOut, collapsed, onNavigate }: SidebarContentProps) {
  const pendingInboxCount = usePendingInboxCount();
  const padding = collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2';

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-3 border-b border-sidebar-border p-4',
          collapsed && 'justify-center p-3',
        )}
      >
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
        {!collapsed && (
          <span className="truncate text-sm font-medium text-sidebar-foreground">
            {user.displayName ?? 'SecondMind'}
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(baseItemClass, padding, isActive ? activeClass : inactiveClass)
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {!collapsed && item.to === '/inbox' && pendingInboxCount > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                {pendingInboxCount}
              </span>
            )}
            {collapsed && item.to === '/inbox' && pendingInboxCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-2 pb-1">
          <PendingSyncIndicator />
        </div>
      )}

      <div className="space-y-1 border-t border-sidebar-border p-2">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          title={collapsed ? 'Settings' : undefined}
          className={({ isActive }) =>
            cn(baseItemClass, padding, isActive ? activeClass : inactiveClass)
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <button
          type="button"
          onClick={onSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(baseItemClass, padding, inactiveClass)}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );
}

export default function Sidebar({ user, onSignOut, collapsed, onExpandClick }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {collapsed && onExpandClick && (
        <button
          type="button"
          onClick={onExpandClick}
          aria-label="Expandir menú"
          className="flex h-12 w-full items-center justify-center border-b border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}
      <SidebarContent user={user} onSignOut={onSignOut} collapsed={collapsed} />
    </aside>
  );
}
