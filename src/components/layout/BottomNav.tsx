import { useMemo } from 'react';
import { NavLink } from 'react-router';
import { LayoutDashboard, FileText, CheckSquare, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

const baseClass =
  'relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors';

export default function BottomNav() {
  const { t } = useTranslation();
  const pendingInboxCount = usePendingInboxCount();

  // Subset propio de navItems (4 destinos mobile) — labels comparten keys
  // nav.items.* con useNavSections; dentro del componente porque t() debe
  // re-evaluarse al cambiar de idioma.
  const items = useMemo<BottomNavItem[]>(
    () => [
      { label: t('nav.items.dashboard', 'Dashboard'), icon: LayoutDashboard, to: '/', end: true },
      { label: t('nav.items.notes', 'Notas'), icon: FileText, to: '/notes' },
      { label: t('nav.items.tasks', 'Tareas'), icon: CheckSquare, to: '/tasks' },
      { label: t('nav.items.inbox', 'Inbox'), icon: Inbox, to: '/inbox', withBadge: true },
    ],
    [t],
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background"
      style={{ paddingBottom: 'var(--sai-bottom)', height: 'calc(64px + var(--sai-bottom))' }}
      aria-label={t('nav.ariaMain', 'Navegación principal')}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
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
