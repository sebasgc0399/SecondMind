import { NavLink } from 'react-router';
import { LayoutDashboard, FileText, CheckSquare, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePendingInboxCount } from '@/hooks/useInbox';
import type { LucideIcon } from 'lucide-react';

interface BottomNavItem {
  label: string;
  icon: LucideIcon;
  to: string;
  end?: boolean;
  withBadge?: boolean;
}

const items: BottomNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true },
  { label: 'Notas', icon: FileText, to: '/notes' },
  { label: 'Tareas', icon: CheckSquare, to: '/tasks' },
  { label: 'Inbox', icon: Inbox, to: '/inbox', withBadge: true },
];

const baseClass =
  'relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors';

export default function BottomNav() {
  const pendingInboxCount = usePendingInboxCount();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background"
      style={{ paddingBottom: 'var(--sai-bottom)', height: 'calc(64px + var(--sai-bottom))' }}
      aria-label="Navegación principal"
    >
      {items.map((item) => (
        <NavLink
          key={item.label}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(baseClass, isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground')
          }
        >
          <item.icon className="h-5 w-5" />
          <span>{item.label}</span>
          {item.withBadge && pendingInboxCount > 0 && (
            <span className="absolute right-3 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold leading-none text-primary-foreground">
              {pendingInboxCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
