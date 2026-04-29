import { Link } from 'react-router';
import { Search } from 'lucide-react';
import QuickCaptureButton from '@/components/dashboard/QuickCaptureButton';
import useCommandPalette from '@/hooks/useCommandPalette';
import PendingSyncIndicator from './PendingSyncIndicator';

export default function TopBar() {
  const { open: openCommandPalette } = useCommandPalette();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
      <Link
        to="/"
        className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <img src="/favicon.svg" alt="" className="h-5 w-5 shrink-0" />
        <span className="text-sm font-semibold">SecondMind</span>
      </Link>
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
