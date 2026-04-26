import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { SidebarContent } from './Sidebar';
import type { User } from 'firebase/auth';

interface NavigationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onSignOut: () => Promise<void>;
}

export default function NavigationDrawer({
  open,
  onOpenChange,
  user,
  onSignOut,
}: NavigationDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-2xl outline-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:-translate-x-full data-starting-style:-translate-x-full"
          style={{
            paddingTop: 'var(--sai-top)',
            paddingBottom: 'var(--sai-bottom)',
            paddingLeft: 'var(--sai-left)',
          }}
        >
          <Dialog.Close
            aria-label="Cerrar menú"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
            style={{ top: 'calc(var(--sai-top) + 12px)' }}
          >
            <X className="h-4 w-4" />
          </Dialog.Close>
          <SidebarContent
            user={user}
            onSignOut={onSignOut}
            onNavigate={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
