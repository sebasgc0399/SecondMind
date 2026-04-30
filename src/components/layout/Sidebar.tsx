import { NavLink } from 'react-router';
import { Settings, LogOut, Menu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import useCommandPalette from '@/hooks/useCommandPalette';
import { usePendingInboxCount } from '@/hooks/useInbox';
import PendingSyncIndicator from './PendingSyncIndicator';
import { navSections } from './navItems';
import type { User } from 'firebase/auth';

interface SidebarProps {
  user: User;
  onSignOut: () => Promise<void>;
  collapsed?: boolean;
  onExpandClick?: () => void;
  animateEntry?: boolean;
  animateExit?: boolean;
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
  const { open: openCommandPalette } = useCommandPalette();
  const padding = collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2';

  // Cuando se invoca dentro del NavigationDrawer (mobile), cerramos el
  // drawer ANTES de abrir el palette en rAF — evita conflict de
  // z-index (drawer y palette ambos z-50, último portal abierto gana).
  const handleSearchClick = () => {
    onNavigate?.();
    requestAnimationFrame(() => openCommandPalette());
  };

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

      <div className={cn('px-2 pt-2', collapsed && 'flex justify-center')}>
        {collapsed ? (
          <button
            type="button"
            onClick={handleSearchClick}
            title="Buscar"
            aria-label="Buscar"
            className="flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSearchClick}
            aria-label="Buscar"
            className="flex min-h-11 w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-1.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Buscar…</span>
            <kbd className="hidden rounded bg-sidebar-foreground/10 px-1.5 py-0.5 font-mono text-[10px] sm:inline">
              ⌘K
            </kbd>
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-3 p-2">
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1">
            {!collapsed && (
              <h3 className="px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
                {section.label}
              </h3>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn('relative', baseItemClass, padding, isActive ? activeClass : inactiveClass)
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
          </div>
        ))}
      </nav>

      <div className={cn('pb-1', collapsed ? 'flex justify-center' : 'px-2')}>
        <PendingSyncIndicator compact={collapsed} />
      </div>

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

export default function Sidebar({
  user,
  onSignOut,
  collapsed,
  onExpandClick,
  animateEntry,
  animateExit,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        collapsed ? 'w-16' : 'w-64',
        animateEntry && 'animate-in slide-in-from-left duration-200',
        animateExit && 'animate-out slide-out-to-left fill-mode-forwards duration-200',
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
