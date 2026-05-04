import usePendingSyncForEntity, {
  type PendingSyncEntityType,
} from '@/hooks/usePendingSyncForEntity';
import { cn } from '@/lib/utils';

interface PendingSyncDotProps {
  entityType: PendingSyncEntityType;
  id: string;
  // Override de posición. Default: `right-1 top-1`. TaskCard usa `right-12 top-1`
  // para evitar el button expand extruded con margin negativo.
  className?: string;
}

// Dot visual indicador de "este item tiene cambios sin sincronizar". Renderiza
// null si nada pending. Color amber para pending normal, destructive para
// hasError. Paridad cromática con <PendingSyncIndicator /> (paleta global).
export default function PendingSyncDot({ entityType, id, className }: PendingSyncDotProps) {
  const { isPending, hasError } = usePendingSyncForEntity(entityType, id);
  if (!isPending) return null;
  const label = hasError ? 'Cambios sin guardar' : 'Cambios sin sincronizar';
  return (
    <span
      className={cn(
        'pointer-events-none absolute h-2 w-2 rounded-full',
        className ?? 'right-1 top-1',
        hasError ? 'bg-destructive' : 'bg-amber-500',
      )}
      aria-label={label}
      title={label}
    />
  );
}
