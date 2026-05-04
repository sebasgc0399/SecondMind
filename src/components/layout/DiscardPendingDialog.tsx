import { useEffect, useMemo } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Trash2 } from 'lucide-react';
import {
  getDiscardableEntries,
  type DiscardableEntityType,
  type DiscardableEntry,
} from '@/lib/discardableEntries';

interface DiscardPendingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const ENTITY_ORDER: ReadonlyArray<DiscardableEntityType> = [
  'note',
  'inboxItem',
  'task',
  'project',
  'objective',
  'habit',
];

export default function DiscardPendingDialog({
  open,
  onOpenChange,
  onConfirm,
}: DiscardPendingDialogProps) {
  // Snapshot one-shot al abrir. NO reactivo a cambios mid-open: si el usuario
  // descartó algo en otro lado mientras el dialog estaba abierto, el guard
  // de "lista vacía → auto-cierre" abajo lo cubre.
  const entries = useMemo(() => (open ? getDiscardableEntries() : []), [open]);

  useEffect(() => {
    if (open && entries.length === 0) onOpenChange(false);
  }, [open, entries, onOpenChange]);

  const grouped = useMemo(() => {
    const groups = new Map<DiscardableEntityType, { label: string; items: DiscardableEntry[] }>();
    for (const e of entries) {
      const existing = groups.get(e.entityType);
      if (existing) {
        existing.items.push(e);
      } else {
        groups.set(e.entityType, { label: e.entityLabel, items: [e] });
      }
    }
    return ENTITY_ORDER.flatMap((t) => {
      const g = groups.get(t);
      return g ? [{ entityType: t, label: g.label, items: g.items }] : [];
    });
  }, [entries]);

  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none transition-[opacity,transform,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Title className="text-base font-semibold text-foreground">
            ¿Descartar cambios pendientes?
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Estos cambios se perderán y no se podrán recuperar.
          </Dialog.Description>
          <div className="mt-4 max-h-72 overflow-y-auto rounded-md border border-border bg-card">
            {grouped.map((g) => (
              <div key={g.entityType} className="border-b border-border last:border-b-0">
                <h4 className="bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label} · {g.items.length}
                </h4>
                <ul className="space-y-1 px-3 py-2 text-sm text-foreground">
                  {g.items.map((item) => (
                    <li key={`${item.entityType}:${item.id}`} className="truncate">
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Descartar todo
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
