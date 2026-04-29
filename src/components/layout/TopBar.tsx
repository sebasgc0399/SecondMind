import { Link } from 'react-router';
import { PanelLeftOpen, Search } from 'lucide-react';
import QuickCaptureButton from '@/components/dashboard/QuickCaptureButton';
import useAuth from '@/hooks/useAuth';
import useCommandPalette from '@/hooks/useCommandPalette';
import { setPreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';
import PendingSyncIndicator from './PendingSyncIndicator';

interface TopBarProps {
  animateEntry?: boolean;
  animateExit?: boolean;
}

export default function TopBar({ animateEntry, animateExit }: TopBarProps) {
  const { user } = useAuth();
  const { open: openCommandPalette } = useCommandPalette();

  const handleShowSidebar = () => {
    if (!user) return;
    void setPreferences(user.uid, { sidebarHidden: false });
  };

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground',
        animateEntry && 'animate-in slide-in-from-top duration-200',
        animateExit && 'animate-out slide-out-to-top fill-mode-forwards duration-200',
      )}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleShowSidebar}
          aria-label="Mostrar menú"
          title="Mostrar menú"
          className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden />
        </button>
        <Link
          to="/"
          className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <img src="/favicon.svg" alt="" className="h-5 w-5 shrink-0" />
          <span className="text-sm font-semibold">SecondMind</span>
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <PendingSyncIndicator compact />
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Abrir buscador"
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span>Buscar</span>
          <kbd className="hidden rounded bg-sidebar-foreground/10 px-1.5 py-0.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </button>
        <QuickCaptureButton />
      </div>
    </header>
  );
}
