import { X } from 'lucide-react';
import { useCell } from 'tinybase/ui-react';

interface SplitPaneHeaderProps {
  noteId: string;
  onClose: () => void;
}

// Header sutil del CONTENEDOR del pane (no del editor interno). Aparece solo
// cuando hay split activo, encima del NoteEditorContainer. Title reactivo vía
// useCell — refleja cambios del título sin refresh. `min-w-0 flex-1 truncate`
// obligatorio en el span del título (gotcha CLAUDE.md) para que truncate
// funcione dentro del flex container.
export default function SplitPaneHeader({ noteId, onClose }: SplitPaneHeaderProps) {
  const titleCell = useCell('notes', noteId, 'title') as string | undefined;
  const title = (titleCell ?? '').trim() || 'Sin título';

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar este panel"
        title="Cerrar panel"
        className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
