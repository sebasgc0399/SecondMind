import { Popover } from '@base-ui/react/popover';
import { Sparkles } from 'lucide-react';
import { useCell } from 'tinybase/ui-react';

interface DistillIndicatorProps {
  noteId: string;
  onOpenSummary: () => void;
}

type Level = 0 | 1 | 2 | 3;

const LEVEL_META: Record<Level, { label: string; tip: string; badgeClass: string }> = {
  0: {
    label: 'Sin destilación',
    tip: 'Selecciona los pasajes clave y aplícales negrita (Ctrl+B) para marcarlos como L1.',
    badgeClass: 'bg-muted/40 text-muted-foreground',
  },
  1: {
    label: 'Pasajes clave marcados',
    tip: 'De lo que marcaste, resalta lo verdaderamente esencial con Ctrl+Shift+H para subir a L2.',
    badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  },
  2: {
    label: 'Esenciales resaltados',
    tip: 'Escribí un resumen ejecutivo en tus palabras para subir a L3.',
    badgeClass: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  },
  3: {
    label: 'Resumen escrito',
    tip: 'Destilación completa. La nota está lista para el vos del futuro.',
    badgeClass: 'bg-green-500/15 text-green-700 dark:text-green-400',
  },
};

export default function DistillIndicator({ noteId, onOpenSummary }: DistillIndicatorProps) {
  const raw = useCell('notes', noteId, 'distillLevel');
  const level = (Number(raw) || 0) as Level;
  const meta = LEVEL_META[level];

  return (
    <Popover.Root>
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
                onClick={onOpenSummary}
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
