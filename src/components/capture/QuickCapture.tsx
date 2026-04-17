import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Check } from 'lucide-react';
import useQuickCapture from '@/hooks/useQuickCapture';

type Status = 'editing' | 'saved';

interface QuickCaptureContentProps {
  initialContent: string;
  onSave: (rawContent: string) => void;
  onClose: () => void;
}

function QuickCaptureContent({ initialContent, onSave, onClose }: QuickCaptureContentProps) {
  const [rawContent, setRawContent] = useState(initialContent);
  const [status, setStatus] = useState<Status>('editing');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function submit() {
    const trimmed = rawContent.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setStatus('saved');
    window.setTimeout(onClose, 300);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submit();
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
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="hidden md:inline">
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
        <div className="ml-auto flex gap-2 md:hidden">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!rawContent.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    </>
  );
}

export default function QuickCapture() {
  const { isOpen, initialContent, close, save } = useQuickCapture();

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) close();
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background-deep/80 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-xl -translate-x-1/2 -translate-y-1/2 scale-100 rounded-2xl border border-border-strong bg-card p-6 opacity-100 shadow-[0_20px_40px_rgba(0,0,0,0.5)] outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Title className="sr-only">Captura rápida</Dialog.Title>
          {isOpen && (
            <QuickCaptureContent initialContent={initialContent} onSave={save} onClose={close} />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
