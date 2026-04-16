import { Plus } from 'lucide-react';
import useQuickCapture from '@/hooks/useQuickCapture';

export default function QuickCaptureButton() {
  const { open } = useQuickCapture();
  return (
    <button
      type="button"
      onClick={() => open()}
      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
    >
      <Plus className="h-4 w-4" />
      Captura rápida
      <kbd className="hidden rounded bg-primary-foreground/15 px-1.5 py-0.5 font-mono text-[10px] sm:inline">
        Alt+N
      </kbd>
    </button>
  );
}
