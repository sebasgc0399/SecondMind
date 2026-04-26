import { Dialog } from '@base-ui/react/dialog';
import { NavLink } from 'react-router';
import { FolderKanban, Target, Repeat, Network, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface MoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MoreItem {
  label: string;
  icon: LucideIcon;
  to: string;
}

const items: MoreItem[] = [
  { label: 'Proyectos', icon: FolderKanban, to: '/projects' },
  { label: 'Objetivos', icon: Target, to: '/objectives' },
  { label: 'Hábitos', icon: Repeat, to: '/habits' },
  { label: 'Grafo', icon: Network, to: '/notes/graph' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

const baseItemClass =
  'flex w-full items-center gap-3 rounded-md px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent';
const activeClass = 'bg-accent';

export default function MoreDrawer({ open, onOpenChange }: MoreDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-1 rounded-t-2xl border-t border-border bg-background p-4 shadow-2xl outline-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:translate-y-full data-starting-style:translate-y-full"
          style={{ paddingBottom: 'calc(16px + var(--sai-bottom))' }}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          <Dialog.Title className="sr-only">Más opciones</Dialog.Title>
          {items.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={() => onOpenChange(false)}
              className={({ isActive }) => cn(baseItemClass, isActive && activeClass)}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
