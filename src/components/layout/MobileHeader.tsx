import { Menu } from 'lucide-react';
import { useLocation } from 'react-router';
import PendingSyncIndicator from './PendingSyncIndicator';
import { navItems } from './navItems';

interface MobileHeaderProps {
  onMenuClick: () => void;
}

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  const exact = navItems.find((item) => item.to === pathname);
  if (exact) return exact.label;
  const prefix = navItems.find((item) => item.to !== '/' && pathname.startsWith(item.to));
  if (prefix) return prefix.label;
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'SecondMind';
}

export default function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const { pathname } = useLocation();
  const title = getPageTitle(pathname);

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background px-2"
      style={{ paddingTop: 'var(--sai-top)' }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menú"
        className="flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
      <PendingSyncIndicator />
    </header>
  );
}
