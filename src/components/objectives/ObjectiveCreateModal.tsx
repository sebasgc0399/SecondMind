import { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AREAS, type AreaKey } from '@/types/area';

interface CreateObjectiveInput {
  name: string;
  areaId: string;
  deadline: number;
}

interface ObjectiveCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateObjectiveInput) => Promise<string | null>;
}

const AREA_ENTRIES = Object.entries(AREAS) as [AreaKey, (typeof AREAS)[AreaKey]][];
const DEFAULT_AREA: AreaKey = AREA_ENTRIES[0]?.[0] ?? 'proyectos';

function fromDateInputValue(value: string): number {
  if (!value) return 0;
  const parts = value.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) return 0;
  const d = new Date(year, month - 1, day);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

export default function ObjectiveCreateModal({
  open,
  onOpenChange,
  onCreate,
}: ObjectiveCreateModalProps) {
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState<AreaKey>(DEFAULT_AREA);
  const [deadlineInput, setDeadlineInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset del form al cerrar
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset del form cuando el modal cierra (alternativa: key={} para remount). Backlog
      setName('');
      setAreaId(DEFAULT_AREA);
      setDeadlineInput('');
      setIsSubmitting(false);
    }
  }, [open]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    const deadline = fromDateInputValue(deadlineInput);
    const objectiveId = await onCreate({ name: trimmed, areaId, deadline });
    if (objectiveId) {
      onOpenChange(false);
    } else {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background-deep/80 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 scale-100 rounded-2xl border border-border-strong bg-card p-6 opacity-100 shadow-modal outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Title className="text-lg font-semibold text-foreground">
            Nuevo objetivo
          </Dialog.Title>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="mt-4 flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Nombre
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Lanzar MVP..."
                autoFocus
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Área
              </span>
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value as AreaKey)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
              >
                {AREA_ENTRIES.map(([key, area]) => (
                  <option key={key} value={key}>
                    {area.emoji} {area.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Deadline (opcional)
              </span>
              <input
                type="date"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
              />
            </label>

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
