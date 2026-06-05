import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

type ActionStatusVariant = 'loading' | 'success' | 'error';

interface ActionStatusProps {
  variant: ActionStatusVariant;
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Slot del CTA (botón a /login). Ausente en loading: se muestra un placeholder pulse. */
  children?: ReactNode;
}

// SPEC-54 F3: estado presentacional compartido por las dos máquinas de /auth/action
// (verify + reset). Reusa el molde de la card de verify-email (icon badge + h2 + texto +
// CTA). Colores de estado: amber (idéntico a verify-email) / green (patrón DistillIndicator)
// / destructive (token). El token --accent-success existe en MASTER.md pero NO está
// cableado en index.css → se usa green-500 crudo como el resto del código.
const BADGE_BG: Record<ActionStatusVariant, string> = {
  loading: 'bg-amber-500/15',
  success: 'bg-green-500/15',
  error: 'bg-destructive/10',
};

const ICON_COLOR: Record<ActionStatusVariant, string> = {
  loading: 'text-amber-600 dark:text-amber-400',
  success: 'text-green-700 dark:text-green-400',
  error: 'text-destructive',
};

export default function ActionStatus({
  variant,
  icon: Icon,
  title,
  description,
  children,
}: ActionStatusProps) {
  const isLoading = variant === 'loading';
  return (
    <div
      // error = anuncio asertivo (convención role="alert" de LoginCard); loading/success
      // = polite. G5 del plan.
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? undefined : 'polite'}
      className="flex flex-col items-center gap-4 text-center"
    >
      <div className={cn('rounded-full p-3', BADGE_BG[variant], isLoading && 'animate-pulse')}>
        <Icon className={cn('size-6', ICON_COLOR[variant])} aria-hidden />
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {isLoading ? (
        // Placeholder pulse de la altura del botón (lg = h-9): evita el layout shift
        // cuando loading resuelve a success/error (que sí tienen CTA). Skeleton, no spinner.
        <div className="mt-2 h-9 w-full animate-pulse rounded-lg bg-muted" />
      ) : (
        children
      )}
    </div>
  );
}
