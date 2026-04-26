import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Sparkles } from 'lucide-react';
import { useCell } from 'tinybase/ui-react';
import useAuth from '@/hooks/useAuth';
import usePreferences from '@/hooks/usePreferences';
import { setPreferences } from '@/lib/preferences';

interface DistillIndicatorProps {
  noteId: string;
  onOpenSummary: () => void;
}

type Level = 0 | 1 | 2 | 3;

const LEVEL_META: Record<Level, { label: string; tip: string; badgeClass: string }> = {
  0: {
    label: 'Sin destilación',
    tip: 'Selecciona los pasajes clave y aplícales negrita (Ctrl+B) para marcarlos como L1.',
    badgeClass:
      'border border-dashed border-violet-400/60 bg-violet-500/5 text-violet-700 dark:border-violet-300/40 dark:text-violet-300',
  },
  1: {
    label: 'Pasajes clave marcados',
    tip: 'De lo que marcaste, resalta lo verdaderamente esencial con Ctrl+Shift+H para subir a L2.',
    badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  },
  2: {
    label: 'Esenciales resaltados',
    tip: 'Escribe un resumen ejecutivo en tus palabras para subir a L3 — la nota queda lista para tu yo del futuro, sin tener que releer todo.',
    badgeClass: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  },
  3: {
    label: 'Resumen escrito',
    tip: 'Destilación completa. La nota está lista para tu yo del futuro.',
    badgeClass: 'bg-green-500/15 text-green-700 dark:text-green-400',
  },
};

export default function DistillIndicator({ noteId, onOpenSummary }: DistillIndicatorProps) {
  const raw = useCell('notes', noteId, 'distillLevel');
  const level = (Number(raw) || 0) as Level;
  const meta = LEVEL_META[level];

  const { user } = useAuth();
  const { preferences, isLoaded } = usePreferences();
  const [open, setOpen] = useState(false);
  // Garantiza que la apertura automática del intro corre una sola vez por
  // mount. Sin esto, cualquier re-render con preferences/isLoaded estables
  // dispararia setOpen(true) en bucle. El user puede cerrar y volver a abrir
  // manualmente despues — el flag persistido evita que vuelva a auto-abrir
  // en futuros mounts.
  const initialAutoOpenedRef = useRef(false);

  useEffect(() => {
    if (initialAutoOpenedRef.current) return;
    if (!isLoaded) return;
    initialAutoOpenedRef.current = true;
    if (preferences.distillIntroSeen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-open intro tras hidratación de preferences (one-shot via ref guard). Backlog
    setOpen(true);
  }, [isLoaded, preferences.distillIntroSeen]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && user && isLoaded && !preferences.distillIntroSeen) {
        void setPreferences(user.uid, { distillIntroSeen: true });
      }
    },
    [user, isLoaded, preferences.distillIntroSeen],
  );

  const handleOpenSummaryClick = useCallback(() => {
    // Cerrar dispara handleOpenChange → persiste distillIntroSeen si era
    // la primera apertura. UX: el usuario "completa la accion sugerida",
    // ya no necesita ver el popover otra vez.
    setOpen(false);
    onOpenSummary();
  }, [onOpenSummary]);

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        aria-label={`Nivel de destilación: L${level} — ${meta.label}`}
        className="inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2 outline-none transition-colors hover:bg-accent/40"
      >
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.badgeClass}`}
        >
          <Sparkles className="h-3 w-3" />L{level}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end">
          <Popover.Popup className="z-50 w-72 rounded-lg border border-border bg-card p-4 text-sm shadow-lg outline-none transition-[opacity,transform,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="flex items-center gap-2 font-semibold text-foreground">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${meta.badgeClass}`}
              >
                L{level}
              </span>
              <span>{meta.label}</span>
            </Popover.Title>
            <Popover.Description className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {meta.tip}
            </Popover.Description>
            {level < 3 && (
              <button
                type="button"
                onClick={handleOpenSummaryClick}
                className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Escribir resumen L3
              </button>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
