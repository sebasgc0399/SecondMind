import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useMountedTransition from '@/hooks/useMountedTransition';
import useSwUpdate from '@/hooks/useSwUpdate';
import { cn } from '@/lib/utils';

const ANIMATION_DURATION_MS = 200;

export default function UpdateBanner() {
  const { needRefresh, applyUpdate } = useSwUpdate();
  const transition = useMountedTransition(needRefresh, ANIMATION_DURATION_MS);

  if (!transition.shouldRender) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-3 border-b border-primary/20 bg-primary px-4 py-2 text-primary-foreground',
        transition.justMounted && 'animate-in slide-in-from-top duration-200',
        transition.isExiting && 'animate-out slide-out-to-top duration-200 fill-mode-forwards',
      )}
    >
      <RefreshCw className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm">Hay una nueva versión disponible.</p>
      <Button size="sm" variant="secondary" onClick={() => void applyUpdate()}>
        Actualizar ahora
      </Button>
    </div>
  );
}
