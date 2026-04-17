import { Plus } from 'lucide-react';
import useQuickCapture from '@/hooks/useQuickCapture';

export default function FAB() {
  const { open } = useQuickCapture();

  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label="Captura rápida"
      className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:bg-primary/90 active:scale-95"
      style={{ bottom: 'calc(80px + 16px + var(--sai-bottom))' }}
    >
      <Plus className="h-6 w-6" />
    </button>
  );
}
