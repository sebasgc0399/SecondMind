import { WifiOff } from 'lucide-react';
import useOnlineStatus from '@/hooks/useOnlineStatus';

export default function OfflineBadge() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 shadow-lg">
      <WifiOff className="h-4 w-4 text-destructive" />
      <span className="text-sm text-foreground">
        Sin conexión — los cambios se sincronizarán al reconectar
      </span>
    </div>
  );
}
