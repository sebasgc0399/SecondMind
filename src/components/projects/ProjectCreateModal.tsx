import { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useNavigate } from 'react-router';
import { AREAS, type AreaKey } from '@/types/area';
import type { Priority } from '@/types/common';

interface CreateProjectInput {
  name: string;
  areaId: string;
  priority: Priority;
}

interface ProjectCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateProjectInput) => Promise<string | null>;
}

const AREA_ENTRIES = Object.entries(AREAS) as [AreaKey, (typeof AREAS)[AreaKey]][];
const DEFAULT_AREA: AreaKey = AREA_ENTRIES[0]?.[0] ?? 'proyectos';

export default function ProjectCreateModal({
  open,
  onOpenChange,
  onCreate,
}: ProjectCreateModalProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState<AreaKey>(DEFAULT_AREA);
  const [priority, setPriority] = useState<Priority>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset del form al cerrar
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset del form al cerrar; key={} remount romperia la animación de cierre de base-ui Dialog (los inputs se vaciarian visualmente durante el fade-out)
      setName('');
      setAreaId(DEFAULT_AREA);
      setPriority('medium');
      setIsSubmitting(false);
    }
  }, [open]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    const projectId = await onCreate({ name: trimmed, areaId, priority });
    if (projectId) {
      onOpenChange(false);
      navigate(`/projects/${projectId}`);
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
            Nuevo proyecto
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
                placeholder="Sitio web personal..."
                autoFocus
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
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
                  Prioridad
                </span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                >
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </label>
            </div>

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
