import { Menu } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import PendingSyncIndicator from './PendingSyncIndicator';
import { useNavItems } from './navItems';
import type { NavItem } from './navItems';

interface MobileHeaderProps {
  onMenuClick: () => void;
}

// settingsLabel/fallback se pasan resueltos (no t() acá) para mantener la
// función pura y testeable; /settings no está en navItems.
function getPageTitle(pathname: string, navItems: NavItem[], settingsLabel: string): string {
  const dashboard = navItems.find((item) => item.to === '/');
  if (pathname === '/' && dashboard) return dashboard.label;
  const exact = navItems.find((item) => item.to === pathname);
  if (exact) return exact.label;
  const prefix = navItems.find((item) => item.to !== '/' && pathname.startsWith(item.to));
  if (prefix) return prefix.label;
  if (pathname.startsWith('/settings')) return settingsLabel;
  return 'SecondMind';
}

export default function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const { t } = useTranslation();
  const navItems = useNavItems();
  const { pathname } = useLocation();
  const title = getPageTitle(pathname, navItems, t('nav.items.settings', 'Ajustes'));

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background px-2"
      style={{ paddingTop: 'var(--sai-top)' }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        aria-label={t('nav.openMenu', 'Abrir menú')}
        className="flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
      <PendingSyncIndicator />
    </header>
  );
}
