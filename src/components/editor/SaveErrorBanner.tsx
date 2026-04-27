import { useCallback, useState, useSyncExternalStore } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveContentQueue } from '@/lib/saveQueue';

interface SaveErrorBannerProps {
  noteId: string;
  onDiscard: () => void;
}

const COPIED_FEEDBACK_MS = 2000;

function subscribeToQueue(cb: () => void): () => void {
  return saveContentQueue.subscribe(cb);
}

export default function SaveErrorBanner({ noteId, onDiscard }: SaveErrorBannerProps) {
  const getEntry = useCallback(() => saveContentQueue.getEntry(noteId), [noteId]);
  const entry = useSyncExternalStore(subscribeToQueue, getEntry, () => undefined);
  const [copied, setCopied] = useState(false);

  const handleRetry = useCallback(() => {
    saveContentQueue.retryNow(noteId);
  }, [noteId]);

  const handleDiscard = useCallback(() => {
    saveContentQueue.cancel(noteId);
    onDiscard();
  }, [noteId, onDiscard]);

  const handleCopy = useCallback(async () => {
    if (copied) return;
    const current = saveContentQueue.getEntry(noteId);
    if (!current) return;
    const text = `${current.payload.title}\n\n${current.payload.contentPlain}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch (err) {
      console.error('[SaveErrorBanner] clipboard write failed', err);
    }
  }, [copied, noteId]);

  if (!entry || entry.status !== 'error') return null;

  return (
    <div className="mx-auto w-full max-w-180 px-4 pt-3" role="alert">
      <div className="animate-in fade-in slide-in-from-top-1 rounded-md border-l-2 border-destructive bg-destructive/10 px-3 py-2.5 text-sm duration-200">
        <div className="mb-2.5 flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-destructive">No pudimos guardar tu última edición</div>
            <div className="mt-0.5 text-xs text-destructive/80">
              Reintentamos 3 veces sin éxito. Reintentar guarda el contenido completo. Descartar
              revierte el título visible.
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button size="sm" variant="ghost" onClick={handleCopy} disabled={copied}>
            {copied ? '✓ Copiado' : 'Copiar contenido'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleDiscard}>
            Descartar cambios
          </Button>
          <Button size="sm" variant="destructive" onClick={handleRetry}>
            Reintentar
          </Button>
        </div>
      </div>
    </div>
  );
}
