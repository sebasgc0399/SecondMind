import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Check } from 'lucide-react';
import useQuickCapture from '@/hooks/useQuickCapture';

type Status = 'editing' | 'saved';

interface QuickCaptureContentProps {
  onSave: (rawContent: string) => void;
  onClose: () => void;
}

function QuickCaptureContent({ onSave, onClose }: QuickCaptureContentProps) {
  const [rawContent, setRawContent] = useState('');
  const [status, setStatus] = useState<Status>('editing');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    const trimmed = rawContent.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setStatus('saved');
    window.setTimeout(onClose, 300);
  }

  if (status === 'saved') {
    return (
      <div className="flex items-center justify-center py-10">
        <Check className="h-10 w-10 text-primary animate-in zoom-in-50 duration-200" />
      </div>
    );
  }

  return (
    <>
      <textarea
        ref={textareaRef}
        value={rawContent}
        onChange={(event) => setRawContent(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escribí una idea..."
        rows={4}
        className="min-h-30 w-full resize-none border-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
            Enter
          </kbd>{' '}
          guardar ·{' '}
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
            Shift+Enter
          </kbd>{' '}
          línea nueva ·{' '}
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
            Esc
          </kbd>{' '}
          cancelar
        </span>
      </div>
    </>
  );
}

export default function QuickCapture() {
  const { isOpen, close, save } = useQuickCapture();

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) close();
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background-deep/80 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-xl -translate-x-1/2 -translate-y-1/2 scale-100 rounded-2xl border border-border-strong bg-card p-6 opacity-100 shadow-[0_20px_40px_rgba(0,0,0,0.5)] outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Title className="sr-only">Captura rápida</Dialog.Title>
          {isOpen && <QuickCaptureContent onSave={save} onClose={close} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
